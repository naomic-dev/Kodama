const schedule = require('node-schedule');
const { RichEmbed } = require('discord.js');
const config = require('../config');
const log = require('../logger');
const store = require('../store/jsonStore');
const state = require('../store/state');
const { getChannel } = require('../lib/channels');
const googleService = require('./google');
const { addMissingSecretClubRoles } = require('./lobby');

function scheduleMidnightJobs() {
	const rule = new schedule.RecurrenceRule(null, null, null, null, 0, 0, 0);

	schedule.scheduleJob(rule, async function () {
		if (store.exists('lobby')) {
			state.lobbyList = store.load('lobby', []);

			let updateLobbyListFile = false,
				updateKickedListFile = false,
				kickedMembers = '',
				kickedList = [];

			if (store.exists('kicked')) {
				kickedList = store.load('kicked', []);
			}

			const dmEmbed = new RichEmbed()
				.setTitle('You\'ve been removed from the server.')
				.setColor(0x1abc9c)
				.setDescription('Hi, friend!\n\nYou\'ve been removed our server because you were in the lobby for over a week without introducing yourself.\n\nYou\'re more than welcome to come back any time.');

			state.lobbyList.forEach(function (loiterer) {
				const member = state.guild.members.find(m => m.id == loiterer.id);

				if (member && member.roles.get(config.roles.admin) == null && new Date(loiterer.expirationDate) <= new Date()) {
					if (!kickedList.includes(member.id)) {
						kickedList.push(member.id);
					}

					updateKickedListFile = true;

					member.send(dmEmbed)
						.then(() => member.send('invite link'))
						.catch(err => log.warn('Failed to DM member being kicked', { memberId: member.id }, err))
						.then(() => member.kick())
						.catch(err => log.error('Failed to kick member', { memberId: member.id }, err));

					kickedMembers += member + '\n';

					state.lobbyList = state.lobbyList.filter(l => l.id != loiterer.id);
					updateLobbyListFile = true;
				}
				else if (!member) {
					state.lobbyList = state.lobbyList.filter(l => l.id != loiterer.id);
					updateLobbyListFile = true;
				}
			});

			if (updateLobbyListFile) {
				store.save('lobby', state.lobbyList);
			}

			if (updateKickedListFile) {
				store.saveSync('kicked', kickedList);
			}

			if (kickedMembers != '') {
				const adminOnlyChannel = getChannel(state.guild, 'adminOnly'),
					embed = new RichEmbed()
						.setTitle('The following members were kicked from the lobby!')
						.setColor(0x1abc9c)
						.setDescription(kickedMembers);

				adminOnlyChannel.send(embed)
					.catch(err => log.error('Failed to post lobby kick summary', { channel: 'adminOnly' }, err));
			}
		}

		googleService.announceNextWeeksEvents(state.guild, googleService.getAuth());

		addMissingSecretClubRoles();

		log.info('Midnight job complete');
	});
}

module.exports = {
	scheduleMidnightJobs: scheduleMidnightJobs
};
