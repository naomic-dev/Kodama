const { RichEmbed } = require('discord.js');
const log = require('../logger');
const store = require('../store/jsonStore');
const state = require('../store/state');
const { Poll, OptionEmoji } = require('../models/poll');
const { admitMember } = require('../services/lobby');

async function onMessageReactionAdd(client, reaction, reactionUser) {
	if (!reaction || !reactionUser || reactionUser.bot) {
		return;
	}

	const reactionMember = state.guild.member(reactionUser);

	if (!reactionMember) {
		return;
	}

	const unfinishedPollIndex = state.unfinishedPollList.findIndex(p => p.memberId == reactionMember.id && p.setupData && p.setupData.messageId == reaction.message.id),
		openPollIndex = (unfinishedPollIndex != -1 ? -1 : state.openPollList.findIndex(p => p.messageId == reaction.message.id)),
		lobbyListIndex = (unfinishedPollIndex != -1 || openPollIndex != -1 ? -1 : state.lobbyList.findIndex(l => l.message_id == reaction.message.id));

	if (unfinishedPollIndex != -1 && state.unfinishedPollList[unfinishedPollIndex]) {
		const unfinishedPoll = state.unfinishedPollList[unfinishedPollIndex];

		Object.setPrototypeOf(unfinishedPoll, Poll.prototype);

		const option = (unfinishedPoll.setupData && unfinishedPoll.setupData.messageId == reaction.message.id && unfinishedPoll.options.length > 0 ? unfinishedPoll.options[unfinishedPoll.options.length - 1] : null),
			embed = new RichEmbed()
				.setColor(0x1abc9c)
				.setTitle('New Poll Set Up');

		if (option && option.emoji == null) {
			if (!reaction.emoji.id || client.emojis.get(reaction.emoji.id)) {
				option.emoji = new OptionEmoji(reaction.emoji.name, reaction.emoji.id);
				unfinishedPoll.options[unfinishedPoll.options.length - 1] = option;


				embed.setDescription(unfinishedPoll.getDescriptionForEmbed(state.guild) + '**Next: Type out another voting option for your poll.**\n\nNote: Type [done] if you are finished adding options.');

				state.unfinishedPollList[unfinishedPollIndex] = unfinishedPoll;

				store.save('unfinishedPolls', state.unfinishedPollList, (err) => {
					if (!err) {
						reaction.message.edit(embed);
					}
				});
			}
			else {
				embed.setColor(0xe91e63)
					.setDescription(unfinishedPoll.getDescriptionForEmbed(state.guild) + '**ERROR: You must react to this message with a default emoji or a custom emoji from this server!\n\n**Next: React with an emoji for this option.**\n\nNote: The emoji must be a default emoji or a custom emoji from this server.');

				reaction.message.edit(embed);
			}
		}
	}
	else if (openPollIndex != -1 && state.openPollList[openPollIndex]) {
		if (state.openPollList[openPollIndex].optionsAreMutuallyExclusive) {
			state.openPollList[openPollIndex].options.filter(o => o.emoji.name != reaction.emoji.name && o.emoji.id != reaction.emoji.id).forEach((option) => {
				option.memberIds = option.memberIds.filter(i => i != reactionMember.id)

				const otherReaction = reaction.message.reactions.find(r => r.emoji.name == option.emoji.name && r.emoji.id == option.emoji.id);

				if (otherReaction) {
					otherReaction.remove(reactionUser);
				}
			})
		}

		const optionListIndex = state.openPollList[openPollIndex].options.findIndex(o => o.emoji.name == reaction.emoji.name && o.emoji.id == reaction.emoji.id);

		if (optionListIndex != -1) {
			const option = state.openPollList[openPollIndex].options[optionListIndex];

			if (!option.memberIds.includes(reactionMember.id)) {
				option.memberIds.push(reactionMember.id);

				store.save('openPolls', state.openPollList);
			}
		}
	}
	else if (lobbyListIndex != -1 && state.lobbyList[lobbyListIndex]) {
		const loiterer = state.lobbyList[lobbyListIndex],
			loitererMember = state.guild.members.find(m => m.id == loiterer.id);

		if (!loitererMember) {
			return;
		}

		if (reaction.emoji.name == "👎") {
			log.info('Lobby rejection logged', { memberId: loiterer.id, displayName: loitererMember.displayName });
		}
		else {
			log.info('Member admitted by reaction', { memberId: loiterer.id, displayName: loitererMember.displayName });
			admitMember(loitererMember);
		}
	}
}

async function onMessageReactionRemove(reaction, reactionUser) {
	if (!reaction || !reactionUser || reactionUser.bot) {
		return;
	}

	const reactionMember = state.guild.member(reactionUser);

	if (!reactionMember) {
		return;
	}

	const openPollIndex = state.openPollList.findIndex(p => p.messageId == reaction.message.id);

	if (openPollIndex != -1 && state.openPollList[openPollIndex]) {
		const optionListIndex = state.openPollList[openPollIndex].options.findIndex(o => o.emoji.name == reaction.emoji.name && o.emoji.id == reaction.emoji.id);

		if (optionListIndex != -1) {
			const option = state.openPollList[openPollIndex].options[optionListIndex];

			option.memberIds = option.memberIds.filter(i => i != reactionMember.id);

			store.save('openPolls', state.openPollList);
		}
	}
}

function onRaw(client, packet) {
	if (!['MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE'].includes(packet.t)) return;

	const channel = client.channels.get(packet.d.channel_id);

	if (!channel || channel.messages.has(packet.d.message_id)) return;

	channel.fetchMessage(packet.d.message_id).then(message => {
		// Emojis can have identifiers of name:id format, so we have to account for that case as well
		const emoji = packet.d.emoji.id ? `${packet.d.emoji.name}:${packet.d.emoji.id}` : packet.d.emoji.name;

		// This gives us the reaction we need to emit the event properly, in top of the message object
		const reaction = message.reactions.get(emoji);

		if (!reaction) return;

		// Adds the currently reacting user to the reaction's users collection.
		reaction.users.set(packet.d.user_id, client.users.get(packet.d.user_id));

		// Check which type of event it is before emitting
		if (packet.t === 'MESSAGE_REACTION_ADD') {
			client.emit('messageReactionAdd', reaction, client.users.get(packet.d.user_id));
		}

		if (packet.t === 'MESSAGE_REACTION_REMOVE') {
			client.emit('messageReactionRemove', reaction, client.users.get(packet.d.user_id));
		}
	}).catch(err => log.error('Failed to process raw gateway event', { event: packet.t }, err));
}

module.exports = {
	onMessageReactionAdd: onMessageReactionAdd,
	onMessageReactionRemove: onMessageReactionRemove,
	onRaw: onRaw
};
