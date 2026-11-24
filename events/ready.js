const config = require('../config');
const log = require('../logger');
const store = require('../store/jsonStore');
const state = require('../store/state');
const googleService = require('../services/google');
const { scheduleMidnightJobs } = require('../services/scheduler');
const { schedulePollClosures } = require('../services/polls');

async function onReady(client) {
	state.guild = client.guilds.find(g => g.id === config.guildId)

	if (!state.guild) {
		log.error('Configured guild not found', { guildId: config.guildId });
		process.exit(1);
	}

	client.user.setPresence({
		game: {
			name: 'kod!help | The forest\'s little helper',
			type: 'PLAYING'
		}
	});

	log.info('Discord presence set', { activity: 'kod!help | The forest\'s little helper' });

	await googleService.setGoogleApiAuth();

	log.info('Google API authentication ready');

	scheduleMidnightJobs();

	log.info('Scheduled midnight jobs');

	if (store.exists('openPolls')) {
		state.openPollList = store.load('openPolls', []);

		log.info('Loaded state', { file: 'open polls.json', count: state.openPollList.length });
	}

	if (store.exists('unfinishedPolls')) {
		state.unfinishedPollList = store.load('unfinishedPolls', []);

		log.info('Loaded state', { file: 'unfinished polls.json', count: state.unfinishedPollList.length });
	}

	if (store.exists('lobby')) {
		state.lobbyList = store.load('lobby', []);

		log.info('Loaded state', { file: 'lobby.json', count: state.lobbyList.length });
	}

	schedulePollClosures();

	log.info('Scheduled poll closures', { openPolls: state.openPollList.length });

	log.info('Startup complete', { user: client.user.tag, guildId: config.guildId, guildName: state.guild.name });
}

module.exports = {
	onReady: onReady
};
