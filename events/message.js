const config = require('../config');
const state = require('../store/state');
const { RichEmbed } = require('discord.js');
const { getChannel } = require('../lib/channels');
const { parseCommand } = require('../lib/prefix');
const { handlePollSetup, handleAdminCommand, handleUtilityCommand } = require('../commands');

function onMessage(client, msg) {
	const member = msg.member,
		contentToLowerCase = msg.content.toLowerCase();

	if (msg.channel.type === 'dm' && msg.author.id !== client.user.id) {
		const channel = getChannel(state.guild, 'adminOnly'),
			embed = new RichEmbed()
				.setColor(0x1abc9c)
				.setTitle(`${msg.author.username} sent Kodama a DM`);

		let embedDescription = `**From:**\n${msg.author}\n\n**Content:**\n${msg.content}`;

		if (msg.attachments.length === 1) {
			embed.setImage(msg.attachments.first().url);
		}
		else if (msg.attachments.length > 1) {
			embedDescription += '\n\n**Attachments:**\n';

			msg.attachments.forEach((attachment) => {
				embedDescription += attachment.url + '\n';
			});

			embed.setImage(msg.attachments.first().url);
		}

		embed.setDescription(embedDescription);

		channel.send(embed);

		return;
	}

	let allowCommands = true;

	const command = parseCommand(msg.content, client.user.id);

	const isAdmin = member && member.roles.get(config.roles.admin);
	const isMember = member && member.roles.get(config.roles.member);

	if (isAdmin) {
		if (handlePollSetup(msg, member, contentToLowerCase)) {
			allowCommands = false;
		}
	}

	if (allowCommands && isAdmin) {
		if (handleAdminCommand(msg, member)) {
			allowCommands = false;
		}
	}

	if (allowCommands && command !== '' && (isMember || isAdmin)) {
		handleUtilityCommand(client, msg, command);
	}
}

module.exports = {
	onMessage: onMessage
};
