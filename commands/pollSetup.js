const { RichEmbed } = require('discord.js');
const config = require('../config');
const log = require('../logger');
const store = require('../store/jsonStore');
const state = require('../store/state');
const { Poll, PollSetupData } = require('../models/poll');
const { schedulePollClosure } = require('../services/polls');

function handlePollSetup(msg, member, contentToLowerCase) {
	if (!member || !member.roles.get(config.roles.admin)) {
		return false;
	}

	const poll = (state.unfinishedPollList.length > 0 ? state.unfinishedPollList.find(p => p.memberId == member.id) : null);

	if (!poll) {
		return false;
	}

	Object.setPrototypeOf(poll, Poll.prototype);

	const pollListIndex = state.unfinishedPollList.findIndex(p => p.memberId == member.id),
		embed = new RichEmbed()
			.setColor(0x1abc9c);

	let updateUnfinishedList = true;

	if (poll.title == null) {
		poll.title = (msg.content == 'none' ? '' : msg.content);

		embed.setDescription(poll.getDescriptionForEmbed(state.guild) + '**Next: Type out a description for your poll.**');

	}
	else if (poll.description == null) {
		poll.description = (msg.content == 'none' ? '' : msg.content);

		embed.setDescription(poll.getDescriptionForEmbed(state.guild) + '**Next: Type out a poll duration.**\n\n*Ex: 1 hour\nEx: 4 days*');
	}
	else if (poll.expirationDate == null) {
		const date = new Date();

		let amount = null,
			amountValid = false;

		if (msg.content.includes('hr') || msg.content.includes('hour')) {
			amount = Number.parseInt(msg.content.substring(0, msg.content.indexOf('h')).trim());

			if (amount && !Number.isNaN(amount)) {
				poll.expirationDate = new Date(date.setTime(date.getTime() + amount * 3600000));
				amountValid = true;
			}
		}
		else if (msg.content.includes('day')) {
			amount = Number.parseInt(msg.content.substring(0, msg.content.indexOf('d')).trim());

			if (amount && !Number.isNaN(amount)) {
				poll.expirationDate = new Date(date.setTime(date.getTime() + amount * 86400000));
				amountValid = true;
			}
		}

		if (amountValid) {
			embed.setDescription(poll.getDescriptionForEmbed(state.guild) + '**Next: Should options on this poll be mutually exclusive?**\nIf "yes", users will only be able to pick one option at a time.');
		}
		else {
			updateUnfinishedList = false;

			embed.setDescription(poll.getDescriptionForEmbed(state.guild) + '**ERROR: Poll duration syntax error!\n\nNext: Type out a poll duration.**\n\n*Ex: 1 hour\nEx: 4 days*')
				.setColor(0xe91e63);
		}
	}
	else if (poll.optionsAreMutuallyExclusive == null) {
		if (contentToLowerCase == 'yes' || contentToLowerCase == 'y' || contentToLowerCase == 'true' || contentToLowerCase == 't') {
			poll.optionsAreMutuallyExclusive = true;
		}
		else if (contentToLowerCase == 'no' || contentToLowerCase == 'n' || contentToLowerCase == 'false' || contentToLowerCase == 'f') {
			poll.optionsAreMutuallyExclusive = false;
		}
		else {
			updateUnfinishedList = false;
			embed.setDescription(poll.getDescriptionForEmbed(state.guild) + '**ERROR: response must be one of the following:**\nyes, y, true, t\nno, n, false, f\n\n**Next: Should options on this poll be mutually exclusive?**\nIf "yes", users will only be able to pick one option at a time.**')
				.setColor(0xe91e63);;
		}

		if (poll.optionsAreMutuallyExclusive != null) {
			embed.setDescription(poll.getDescriptionForEmbed(state.guild) + '**Next: Type out a voting option for your poll.**');
		}
	}
	else if ((poll.options.length == 0 || poll.options[poll.options.length - 1].emoji != null) && contentToLowerCase != '[done]') {
		poll.addOption(msg.content);

		embed.setDescription(poll.getDescriptionForEmbed(state.guild) + '**Next: React with an emoji for this option.**\n\nNote: The emoji must be a default emoji or a custom emoji from this server.');
	}

	if (poll.options.length > 1 && poll.options[poll.options.length - 1].emoji != null && contentToLowerCase == '[done]') {
		const newPollEmbed = new RichEmbed()
			.setColor(0x1abc9c)
			.setTitle('Poll: ' + poll.title)
			.setDescription(poll.getDescriptionForEmbed(state.guild, 'finished'));

		embed.setTitle('Poll Set Up Complete!');

		state.unfinishedPollList = state.unfinishedPollList.filter(p => p.memberId != member.id);

		if (store.exists('openPolls')) {
			state.openPollList = store.load('openPolls', []);
		}

		const channel = state.guild.channels.find(ch => ch.id == poll.channelId)

		if (!channel) {
			log.error('Poll channel not found', { pollId: poll.id, channelId: poll.channelId });
			return true;
		}

		channel.send(newPollEmbed)
			.then((newPollMessage) => {
				poll.messageId = newPollMessage.id;

				state.openPollList.push(poll);

				store.save('openPolls', state.openPollList);

				poll.options.forEach(async (option) => {
					const emoji = (option.emoji.id ? state.guild.emojis.get(option.emoji.id) : option.emoji.name);

					try {
						await newPollMessage.react(emoji);
					}
					catch (err) {
						log.error('Failed to add poll option reaction', { pollId: poll.id, option: option.title }, err);
					}
				});

				schedulePollClosure(poll);

				log.info('Poll opened', { pollId: poll.id, title: poll.title, channelId: poll.channelId, expiresAt: poll.expirationDate });
			})
			.catch(err => log.error('Failed to post poll', { pollId: poll.id, channelId: poll.channelId }, err));
	}
	else {
		embed.setTitle('New Poll Set Up');

		const pollSetupChannel = state.guild.channels.find(ch => ch.id == poll.setupData.channelId),
			pollMessage = (pollSetupChannel ? pollSetupChannel.messages.find(m => m.id == poll.setupData.messageId) : null);

		if ((poll.options.length <= 1 || poll.options[poll.options.length - 1].emoji == null) && contentToLowerCase == '[done]') {
			let errorMessage = '';

			if (poll.options.length == 0 || (poll.options.length == 1 && (poll.options[0].emoji != null))) {
				errorMessage = '**ERROR: You must have a total of two or more voting options!\n\nNext: Type out a voting option for your poll.**'
			}
			else {
				errorMessage = '**ERROR: You must react to this message with an emoji before you can finish this poll!\n\nNext: React with an emoji for this option.**\n\nNote: The emoji must be a default emoji or a custom emoji from this server.'
			}

			embed.setColor(0xe91e63)
				.setDescription(poll.getDescriptionForEmbed(state.guild) + errorMessage);

			updateUnfinishedList = false;
		}

		if (pollMessage) {
			if (updateUnfinishedList) {
				state.unfinishedPollList[pollListIndex] = poll;
			}

			pollMessage.edit(embed)
				.catch(err => log.error('Failed to update poll setup message', { pollId: poll.id }, err));
		}
		else {
			updateUnfinishedList = false;

			pollSetupChannel.send(embed)
				.then((newPollMessage) => {
					poll.setupData = new PollSetupData(newPollMessage.channel.id, newPollMessage.id);
					state.unfinishedPollList[pollListIndex] = poll;

					store.save('unfinishedPolls', state.unfinishedPollList);
				})
				.catch(err => log.error('Failed to post poll setup message', { pollId: poll.id }, err));
		}
	}

	if (updateUnfinishedList) {
		store.save('unfinishedPolls', state.unfinishedPollList);
	}

	return true;
}

module.exports = {
	handlePollSetup: handlePollSetup
};
