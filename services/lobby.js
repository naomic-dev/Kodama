const { RichEmbed } = require('discord.js');
const config = require('../config');
const log = require('../logger');
const store = require('../store/jsonStore');
const state = require('../store/state');
const { getChannel } = require('../lib/channels');

function admitMember(targetMember) {
	const adminOnlyChannel = getChannel(state.guild, 'adminOnly'),
		adminOnlyEmbed = new RichEmbed()
			.setColor(0x1abc9c);

	if (targetMember) {
		const introductionsChannel = getChannel(state.guild, 'introductions'),
			rulesChannel = getChannel(state.guild, 'rules'),
			selfAssignRolesChannel = getChannel(state.guild, 'selfAssignRoles'),
			infoAndFaqChannel = getChannel(state.guild, 'infoAndFaq');

		targetMember.addRoles([config.roles.member, config.roles.dmsClosed]);

		log.info('Member admitted', { memberId: targetMember.id, displayName: targetMember.displayName });

		adminOnlyEmbed.setTitle('A member has been admitted!');

		let adminOnlyEmbedDescription = `${targetMember.displayName} has been assigned the Member and DMs Closed roles.`;

		state.lobbyList = state.lobbyList.filter(loiterer => loiterer.id !== targetMember.id);

		store.saveSync('lobby', state.lobbyList);

		adminOnlyEmbedDescription += `\n\nRemoved ${targetMember.displayName} from "lobby.json"`;

		adminOnlyEmbed.setDescription(adminOnlyEmbedDescription);

		const introductionsEmbed = new RichEmbed()
			.setTitle('We\'ve got a new member!')
			.setColor(0x1abc9c)
			.setDescription(`${targetMember.displayName} joined the server. Welcome!`);

		const dmEmbed = new RichEmbed()
			.setTitle('Discord Orientation')
			.setColor(0x1abc9c)
			.setDescription(`Hi, ${targetMember.displayName}!\n\n**Here's a quick run-down on our rules:**\n1. This server is 18+ only.\n2. Do not post illegal content.\n3. Be a good person.\n\nThese aren't all of the rules, but they're the most important ones. A more comprehensive list can be found in ${rulesChannel}, so be sure to take a look when you can.\n\nIf you head to ${selfAssignRolesChannel}, you will find a list of roles (including pronouns and name colors) you can assign yourself. All you need to do is emoji react to the requisite role menus!\n\nIf you want to learn more about our server or Discord in general, head over to ${infoAndFaqChannel}.\n\nFinally, feel free to introduce yourself in ${introductionsChannel} and let everyone know a little bit about you.`);

		adminOnlyChannel.send(adminOnlyEmbed)
			.catch(err => log.error('Failed to post admission notice', { memberId: targetMember.id, channel: 'adminOnly' }, err));

		introductionsChannel.send(introductionsEmbed)
			.catch(err => log.error('Failed to post introduction', { memberId: targetMember.id, channel: 'introductions' }, err));

		targetMember.send(dmEmbed).then(() => {
			const dmConfirmEmbed = new RichEmbed()
				.setTitle('DM sent!')
				.setColor(0x1abc9c)
				.setDescription(`Successfully DM'd ${targetMember.displayName} a run-down of the rules.`);

			adminOnlyChannel.send(dmConfirmEmbed)
				.catch(err => log.error('Failed to confirm admission DM', { memberId: targetMember.id }, err));
		}).catch(err => log.error('Failed to DM admitted member', { memberId: targetMember.id }, err));
	}
	else {
		adminOnlyEmbed.setDescription('User not found!');

		adminOnlyChannel.send(adminOnlyEmbed)
			.catch(err => log.error('Failed to post not-found notice', { channel: 'adminOnly' }, err));
	}
}

function addMissingSecretClubRoles() {
	const memberRoleId = config.roles.member,
		secretClubRoleId = config.roles.secretClub,
		vettedRoleId = config.roles.vetted,
		secretClubVettedRoleId = config.roles.secretClubVetted,
		admittedRoles = config.roles.admitted;

	state.guild.members.filter(m => m.roles.find(r => r.id === memberRoleId)).forEach((member) => {
		if (member.roles.some(r => admittedRoles.includes(r.id))) {
			if (!member.roles.find(r => r.id === secretClubRoleId)) {
				if (member.roles.find(r => r.id === vettedRoleId)) {
					member.addRoles([secretClubRoleId, secretClubVettedRoleId]);
				}
				else {
					member.addRole(secretClubRoleId);
				}
			}
		}
	});
}

module.exports = {
	admitMember: admitMember,
	addMissingSecretClubRoles: addMissingSecretClubRoles
};
