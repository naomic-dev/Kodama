const { RichEmbed } = require('discord.js');
const config = require('../config');
const log = require('../logger');
const state = require('../store/state');
const { getChannel } = require('../lib/channels');

function handleUtilityCommand(client, msg, command) {
	if (!msg.member || (!msg.member.roles.get(config.roles.member) && !msg.member.roles.get(config.roles.admin))) {
		return false;
	}

	if (command == 'help' || command == 'h') {
		const channel = getChannel(state.guild, 'botSpam'),
			embed = new RichEmbed()
				.setTitle('Kodama Help Menu')
				.setColor(0x1abc9c)
				.setDescription(`${msg.member} here is a list of commands you can give me:

**Command Syntax**
\`\`\`
@Kodama <command>
kodama!<command>
kod!<command>
\`\`\`

**Display the help menu**
\`\`\`
help
h
\`\`\`

**Display the server avatar**
\`\`\`
server-avatar
sa
\`\`\`

**Display a member's avatar**
\`\`\`
avatar @user
a @user
\`\`\`

**Start a poll (admins)**
\`\`\`
!poll [#channel]
\`\`\``);

		channel.send(embed)
			.catch(err => log.error('Failed to post help menu', { channel: 'botSpam' }, err));

		return true;
	}
	else if (command == 'server-avatar' || command == 'sa') {
		const channel = getChannel(state.guild, 'botSpam'),
			embed = new RichEmbed()
				.setTitle('Server Avatar')
				.setColor(0x1abc9c)
				.setDescription(msg.member)
				.setImage(msg.guild.iconURL);

		channel.send(embed)
			.catch(err => log.error('Failed to post server avatar', { channel: 'botSpam' }, err));

		return true;
	}
	else if (command == 'avatar' || command == 'a') {
		const channel = getChannel(state.guild, 'botSpam'),
			mentions = msg.mentions,
			mentionedUser = mentions.users.filter(u => u.id != client.user.id).first();

		if (mentionedUser) {
			const mentionedMember = mentions.members.first(),
				embed = new RichEmbed()
					.setTitle(`${mentionedMember.displayName}'s Avatar`)
					.setColor(0x1abc9c)
					.setDescription(msg.member)
					.setImage(mentionedUser.avatarURL);

			channel.send(embed)
				.catch(err => log.error('Failed to post member avatar', { channel: 'botSpam', memberId: mentionedMember.id }, err));
		}
		else {
			const embed = new RichEmbed()
				.setTitle('Command Syntax Error')
				.setColor(0xe91e63)
				.setDescription(`${msg.member}\nThe correct syntax for the command is\n\`\`\`kod!avatar {user mention}\`\`\``);

			channel.send(embed)
				.catch(err => log.error('Failed to post avatar syntax error', { channel: 'botSpam' }, err));
		}

		return true;
	}

	return false;
}

module.exports = {
	handleUtilityCommand: handleUtilityCommand
};
