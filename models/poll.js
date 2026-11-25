const uuid = require('uuid/v1');
const { formatDateTime } = require('../lib/time');

class Poll {
	constructor(memberId, setupData = new PollSetupData(null, null), channelId = null, title = null, description = null, expirationDate = null, optionsAreMutuallyExclusive = null, options = []) {
		this.id = uuid();
		this.messageId = null;
		this.memberId = memberId;
		this.setupData = setupData;
		this.channelId = channelId;
		this.title = title;
		this.description = description;
		this.expirationDate = expirationDate;
		this.optionsAreMutuallyExclusive = optionsAreMutuallyExclusive;
		this.options = options;
	}

	addOption(title, emoji = null) {
		this.options.push(new PollOption(title, emoji));
	}

	getDescriptionForEmbed(guild, status = 'unfinished') {
		let returnText = '';

		const member = guild.members.find(m => m.id === this.memberId);

		if (status === 'finished') {
			returnText += `By ${member}\n`;
			returnText += `Closes on ${formatDateTime(new Date(this.expirationDate))}\n\n`;
			returnText += `${this.description}\n\n`;

			this.options.forEach((option) => {
				const emoji = (option.emoji.id ? guild.emojis.get(option.emoji.id) : option.emoji.name);

				returnText += `${emoji}: \`${option.title}\`\n\n`;
			});
		}
		else if (status === 'unfinished') {
			returnText += `By: ${member}\n\n`;

			returnText += `Title: ${(this.title ? this.title : '')}\n`;
			returnText += `Description: ${(this.description ? this.description : '')}\n`;
			returnText += `Closes on: ${(this.expirationDate ? formatDateTime(new Date(this.expirationDate)) : '')}\n`;
			returnText += `Options mutually exclusive: ${(this.optionsAreMutuallyExclusive == null ? '' : (this.optionsAreMutuallyExclusive ? 'Yes' : 'No'))}\n`;
			returnText += 'Options:\n';

			if (this.options) {
				this.options.forEach((option) => {
					let emoji = '[None]';

					if (option.emoji) {
						emoji = (option.emoji.id ? guild.emojis.get(option.emoji.id) : option.emoji.name);
					}

					returnText += `${emoji}: \`${option.title}\`\n`;
				});
			}

			returnText += '\n';
		}
		else if (status === 'closed') {
			returnText += `By ${member}\n`;
			returnText += `${this.description}\n\n`;
			returnText += '__**Final Results:**__\n';

			this.options.forEach((option) => {
				returnText += `\`${option.title}\`: **${option.memberIds.length}**\n\n`;
			});
		}

		return returnText;
	}
}

class PollOption {
	constructor(title, emoji = null) {
		this.title = title;
		this.emoji = emoji;
		this.memberIds = [];
	}
}

class PollSetupData {
	constructor(channelId, messageId) {
		this.channelId = channelId;
		this.messageId = messageId;
	}
}

class OptionEmoji {
	constructor(name, id = null) {
		this.name = name;
		this.id = id;
	}
}

module.exports = {
	Poll: Poll,
	PollOption: PollOption,
	PollSetupData: PollSetupData,
	OptionEmoji: OptionEmoji
};
