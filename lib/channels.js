const config = require('../config');

function getChannel(guild, key) {
	const nameOrId = config.channels[key];

	return guild.channels.find(ch => ch.name === nameOrId || ch.id === nameOrId);
}

module.exports = {
	getChannel: getChannel
};
