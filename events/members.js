const { RichEmbed } = require('discord.js');
const log = require('../logger');
const store = require('../store/jsonStore');
const state = require('../store/state');
const { getChannel } = require('../lib/channels');
const { formatDateForRSVP } = require('../lib/time');

function onGuildMemberAdd(member) {
	log.info('Member joined', { memberId: member.id, displayName: member.displayName });

	const welcomeChannel = getChannel(state.guild, 'welcome'),
		theLobbyChannel = getChannel(state.guild, 'lobby'),
		adminOnlyChannel = getChannel(state.guild, 'adminOnly'),
		dmEmbed = new RichEmbed()
			.setTitle('Welcome to our server!')
			.setColor(0x1abc9c)
			.setDescription(`Hi, ${member.displayName}! My name is Kodama. I'm a chat bot created to help out around the server.\n\nBe sure to read ${welcomeChannel} to get yourself up to speed.\n\nA few notes before you go, though:\n\nA) **This server is intended for adults only.**\n\nB) Before we let you into the rest of the channels in the server, we ask that you introduce yourself in ${theLobbyChannel} and let us know what your name is.`)
			.addField('If we cannot verify you within one week, you will be booted from the server.', 'This is just to keep the lobby clear of loiterers; You\'re free to rejoin any time!'),
		adminOnlyEmbed = new RichEmbed()
			.setTitle('A member joined!')
			.setColor(0x1abc9c)
			.setDescription(`${member.displayName} Joined the server!`);

	let expirationDate = member.joinedAt;

	expirationDate = new Date(expirationDate.setTime(expirationDate.getTime() + 7 * 86400000));

	expirationDate.setHours(23, 59, 59, 999);

	state.lobbyList = state.lobbyList.filter(loiterer => loiterer.id !== member.id);

	dmEmbed.addField('Lobby Removal Date', formatDateForRSVP(expirationDate));

	member.send(dmEmbed)
		.then(() => {
			const dmConfirmEmbed = new RichEmbed()
				.setTitle('DM sent!')
				.setColor(0x1abc9c)
				.setDescription(`Sent ${member.displayName} an introduction to the server.`);

			adminOnlyChannel.send(dmConfirmEmbed)
				.catch(err => log.error('Failed to confirm welcome DM', { memberId: member.id }, err));
		})
		.catch(err => log.warn('Failed to DM new member', { memberId: member.id }, err));

	adminOnlyChannel.send(adminOnlyEmbed)
		.then((msg) => {
			state.lobbyList.push({ id: member.id, expirationDate: expirationDate, message_id: msg.id });

			store.save('lobby', state.lobbyList, (err) => {
				if (!err) {
					log.info('Added member to lobby', { memberId: member.id, displayName: member.displayName, expiresAt: expirationDate.toISOString() });
				}
			});
		})
		.catch(err => log.error('Failed to post join notice', { memberId: member.id, channel: 'adminOnly' }, err));
}

function onGuildMemberRemove(member) {
	log.info('Member left', { memberId: member.id });

	let kickedList = [];

	if (store.exists('kicked')) {
		kickedList = store.load('kicked', []);
	}

	const kickedMemberIndex = kickedList.findIndex(id => id === member.id);

	if (kickedMemberIndex !== -1) {
		kickedList.splice(kickedMemberIndex, 1);
		state.lobbyList = state.lobbyList.filter(l => l.id !== member.id);

		store.save('kicked', kickedList);

		store.save('lobby', state.lobbyList);
	}
	else {
		const adminOnlyChannel = getChannel(state.guild, 'adminOnly'),
			embed = new RichEmbed()
				.setTitle('A member left!')
				.setColor(0x1abc9c)
				.setDescription(`${member} Left the server!`);

		adminOnlyChannel.send(embed)
			.catch(err => log.error('Failed to post leave notice', { memberId: member.id, channel: 'adminOnly' }, err));
	}
}

module.exports = {
	onGuildMemberAdd: onGuildMemberAdd,
	onGuildMemberRemove: onGuildMemberRemove
};
