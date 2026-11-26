const SHORT_PREFIXES = ['kod!', 'kodama!'];

// Returns the command token when the message addresses the bot, or an empty
// string when it uses no recognised prefix. Both mention forms are accepted:
// modern clients send <@id>, older ones and nicknamed members send <@!id>.
function parseCommand(content, botId) {
	const mentions = [`<@${botId}>`, `<@!${botId}>`];
	const mention = mentions.find(prefix => content.startsWith(prefix));

	if (mention) {
		const rest = content.slice(mention.length).trim();

		return rest ? rest.split(/\s+/)[0].toLowerCase() : 'unsure';
	}

	const lower = content.toLowerCase();
	const prefix = SHORT_PREFIXES.find(candidate => lower.startsWith(candidate));

	if (!prefix) {
		return '';
	}

	const rest = content.slice(prefix.length).trim();

	return rest ? rest.split(/\s+/)[0].toLowerCase() : '';
}

module.exports = {
	parseCommand: parseCommand
};
