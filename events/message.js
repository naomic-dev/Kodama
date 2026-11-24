const config = require('../config');
const state = require('../store/state');
const { RichEmbed } = require('discord.js');
const { getChannel } = require('../lib/channels');
const { handlePollSetup, handleAdminCommand, handleUtilityCommand } = require('../commands');

function onMessage(client, msg) {
	const member = msg.member,
		contentToLowerCase = msg.content.toLowerCase();

	if (msg.channel.type == 'dm' && msg.author.id != client.user.id) {
		const channel = getChannel(state.guild, 'adminOnly'),
			embed = new RichEmbed()
			.setColor(0x1abc9c)
			.setTitle(`${msg.author.username} sent Kodama a DM`);

		let embedDescription = `**From:**\n${msg.author}\n\n**Content:**\n${msg.content}`;

		if (msg.attachments.length == 1) {
			embed.setImage(msg.attachments.first().url);
		}
		else if (msg.attachments.length > 1) {
			embedDescription += '\n\n**Attachments:**\n';

			msg.attachments.forEach((attachment) => {
				embedDescription += attachment.url + '\n';
			});

			embed.setImage(msg.attachments.first().url)
		}

		embed.setDescription(embedDescription);

		channel.send(embed);

		return;
	}

	let allowCommands = true;
	let command = '',
		messageBody = '';

	if (msg.content.startsWith(`<@!${client.user.id}>`)) {
		if (msg.content.includes(' ')) {
			messageBody = msg.content.substr(msg.content.indexOf(' ') + 1);

			if (messageBody.includes(' ')) {
				command = messageBody.substr(messageBody.indexOf(' ') + 1).toLowerCase();
			}
			else {
				command = messageBody;
			}
		}
		else {
			command = 'unsure';
		}
	}
	else if (contentToLowerCase.startsWith('kod!') || contentToLowerCase.startsWith('kodama!')) {
		if (msg.content.includes(' ')) {
			const spaceIndex = msg.content.indexOf(' ');

			command = contentToLowerCase.substring(msg.content.indexOf('!') + 1, spaceIndex);

			messageBody = msg.content.substr(spaceIndex + 1);
		}
		else {
			command = contentToLowerCase.substr(msg.content.indexOf('!') + 1);
		}
	}

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

	if (allowCommands && command != '' && (isMember || isAdmin)) {
		handleUtilityCommand(client, msg, command);
	}
}

module.exports = {
	onMessage: onMessage
};
