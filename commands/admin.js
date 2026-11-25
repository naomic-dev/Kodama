const { RichEmbed } = require('discord.js');
const config = require('../config');
const log = require('../logger');
const store = require('../store/jsonStore');
const state = require('../store/state');
const { getChannel } = require('../lib/channels');
const { Poll, PollSetupData } = require('../models/poll');
const { admitMember } = require('../services/lobby');
const googleService = require('../services/google');

const EVENT_TAG_FORMAT_HELP = [
	'Add these tags to the calendar event description:',
	'[type:<event type>] — one of: main munch, billiards, billiards discussion, wlgbt brunch, wlgbt evening, crafts',
	'[url:<rsvp url>] — link shown in the RSVP field'
].join('\n');

function handleAdminCommand(msg, member) {
	if (!member || !member.roles.get(config.roles.admin)) {
		return false;
	}

	const lowerContent = msg.content.toLowerCase();

	if (lowerContent.startsWith('!admit')) {
		const targetUser = msg.mentions.users.first();

		let targetMember = null;

		if (targetUser) {
			targetMember = state.guild.member(targetUser);
		}
		else {
			const username = msg.content.substr(msg.content.indexOf(' ') + 1);

			targetMember = state.guild.members.find(m => m.displayName.toLowerCase() === username.toLowerCase());
		}

		admitMember(targetMember);

		return true;
	}
	else if (lowerContent.startsWith('!poll')) {
		const setupChannel = getChannel(state.guild, 'adminOnly'),
			announcementsChannel = getChannel(state.guild, 'announcements'),
			channel = msg.mentions.channels.first(),
			embed = new RichEmbed()
				.setColor(0x1abc9c)
				.setTitle('New Poll Set Up')
				.setDescription(`Creator: ${member}\n\nTitle:\nDescription:\nExpiration Date:\nOptions:\n\n**Select a title for your poll**`);

		setupChannel.send(embed)
			.then((pollMessage) => {
				const targetChannelId = (channel ? channel.id : announcementsChannel.id);

				state.unfinishedPollList.push(new Poll(member.id, new PollSetupData(setupChannel.id, pollMessage.id), targetChannelId));

				store.save('unfinishedPolls', state.unfinishedPollList);

				log.info('Poll setup started', { memberId: member.id, channelId: targetChannelId });
			})
			.catch(err => log.error('Failed to start poll setup', { memberId: member.id }, err));

		return true;
	}
	else if (member.id === config.ownerId && lowerContent.startsWith('!say')) {
		const channel = msg.mentions.channels.first(),
			kodamaMessage = msg.content
				.replace(/^!say\s+/i, '')
				.replace(/<#\d+>/, '')
				.trim(),
			embed = new RichEmbed()
				.setColor(0x1abc9c)
				.setDescription(kodamaMessage);

		if (!channel || !kodamaMessage) {
			msg.channel.send('Usage: `!say #channel <text>`')
				.catch(err => log.error('Failed to post !say usage', { memberId: member.id }, err));

			return true;
		}

		channel.send(embed);

		return true;
	}
	else if (member.id === config.ownerId && lowerContent === '!ping') {
		const channel = getChannel(state.guild, 'kodamaTest'),
			embed = new RichEmbed()
				.setColor(0x1abc9c)
				.setDescription('Pong!');

		channel.send(embed);

		return true;
	}
	else if (member.id === config.ownerId && lowerContent.startsWith('!announce-events')) {
		googleService.announceNextWeeksEvents(state.guild, googleService.getAuth());

		return true;
	}
	else if (member.id === config.ownerId && lowerContent === '!event-tag-format') {
		const channel = getChannel(state.guild, 'kodamaTest'),
			embed = new RichEmbed()
				.setColor(0x1abc9c)
				.setTitle('Event Tag Format for Google Calendar')
				.setDescription(EVENT_TAG_FORMAT_HELP);

		channel.send(embed);

		return true;
	}
	else if (member.id === config.ownerId && lowerContent === '!update-introduction') {
		const channel = getChannel(state.guild, 'announcements'),
			embed = new RichEmbed()
				.setColor(0x1abc9c)
				.setTitle('Hi, I\'m Kodama!')
				.setDescription('Hello, @everyone! I\'m Kodama.\n\nI handle onboarding, the lobby, polls, and event announcements around here.\n\nFind out what I can do with the command ```kod!help```');

		channel.fetchMessage(config.messages.introduction)
			.then(messageToEdit => {
				messageToEdit.edit(embed)
					.catch(err => log.error('Failed to update introduction message', { messageId: config.messages.introduction }, err));
			})
			.catch(err => log.error('Failed to fetch introduction message', { messageId: config.messages.introduction }, err));

		return true;
	}
	else if (member.id === config.ownerId && lowerContent.startsWith('!add-to-lobby-list') && msg.content.includes(' ')) {
		const channel = getChannel(state.guild, 'kodamaTest'),
			username = msg.content.substr(msg.content.indexOf(' ') + 1).trim(),
			targetMember = state.guild.members.find(m => m.displayName === username),
			embed = new RichEmbed()
				.setColor(0x1abc9c)
				.setTitle('Member Added to Lobby List!');

		if (targetMember) {
			log.info('Adding member to lobby list', { memberId: targetMember.id, displayName: targetMember.displayName });

			let expirationDate = targetMember.joinedAt;

			expirationDate = new Date(expirationDate.setTime(expirationDate.getTime() + 7 * 86400000));

			expirationDate.setHours(23, 59, 59, 999);

			state.lobbyList = state.lobbyList.filter(loiterer => loiterer.id !== targetMember.id);

			embed.setDescription(`Added ${targetMember.displayName} to "lobby.json"\n`);
			channel.send(embed)
				.then((msg) => {
					state.lobbyList.push({ id: targetMember.id, expirationDate: expirationDate, message_id: msg.id });

					store.save('lobby', state.lobbyList);
				})
				.catch(err => log.error('Failed to post lobby list notice', { channel: 'kodamaTest' }, err));


		}
		else {
			log.warn('Could not find member for lobby list', { username: username });

			embed.setTitle('Member not found!')
				.setDescription(`Could not find user ${username}`);

			channel.send(embed)
				.catch(err => log.error('Failed to post lobby list notice', { channel: 'kodamaTest' }, err));
		}

		return true;
	}
	else if (member.id === config.ownerId && lowerContent === '!check-lobby-list') {
		(async function () {
			let updateLobbyListFile = false,
				kickedMembers = '';

			state.lobbyList.forEach(function (loiterer) {
				const member = state.guild.members.find(m => m.id === loiterer.id);

				log.debug('Checking lobby entry', { memberId: loiterer.id, expiresAt: loiterer.expirationDate });

				if (member && new Date(loiterer.expirationDate) <= new Date()) {
					kickedMembers += member + '\n';

					state.lobbyList = state.lobbyList.filter(l => l.id !== loiterer.id);

					updateLobbyListFile = true;
				}
				else if (!member) {
					state.lobbyList = state.lobbyList.filter(l => l.id !== loiterer.id);

					updateLobbyListFile = true;
				}
			});

			if (updateLobbyListFile) {
				store.save('lobby', state.lobbyList);
			}

			if (kickedMembers !== '') {
				const channel = getChannel(state.guild, 'kodamaTest'),
					embed = new RichEmbed()
						.setTitle('The following members should be kicked from the lobby!')
						.setColor(0x1abc9c)
						.setDescription(kickedMembers);

				channel.send(embed)
					.catch(err => log.error('Failed to post lobby check result', { channel: 'kodamaTest', result: 'kicks' }, err));
			}
			else {
				const channel = getChannel(state.guild, 'kodamaTest'),
					embed = new RichEmbed()
						.setTitle('No one to kick from the lobby!')
						.setColor(0x1abc9c)
						.setDescription(':shrug:');

				channel.send(embed)
					.catch(err => log.error('Failed to post lobby check result', { channel: 'kodamaTest', result: 'none' }, err));
			}
		})();

		return true;
	}

	return false;
}

module.exports = {
	handleAdminCommand: handleAdminCommand
};
