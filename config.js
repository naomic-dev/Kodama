const fs = require('fs');
const log = require('./logger');
const paths = require('./lib/paths');

const CONFIG_PATH = paths.configPath;

const DEFAULTS = {
	guildId: '',
	ownerId: '',
	inviteUrl: '',
	roles: {
		admin: '',
		member: '',
		dmsClosed: '',
		vetted: '',
		secretClub: '',
		secretClubVetted: '',
		admitted: []
	},
	channels: {
		adminOnly: 'admin-only',
		announcements: 'announcements',
		botSpam: 'bot-spam',
		infoAndFaq: 'info-and-faq',
		introductions: 'introductions',
		kodamaTest: 'kodama-test',
		rules: 'rules',
		selfAssignRoles: 'self-assign-roles',
		lobby: 'the-lobby',
		welcome: 'welcome'
	},
	messages: {
		introduction: ''
	},
	google: {
		calendarId: '',
		eventQuery: ''
	},
	eventImages: {
		mainMunch: '',
		billiards: '',
		billiardsDiscussion: '',
		wlgbtBrunch: '',
		wlgbtEvening: '',
		crafts: ''
	}
};

const REQUIRED = [
	'guildId',
	'ownerId',
	'roles.admin',
	'roles.member',
	'roles.dmsClosed',
	'messages.introduction',
	'google.calendarId'
];

function merge(base, override) {
	const result = { ...base };

	Object.keys(override || {}).forEach((key) => {
		const value = override[key];

		if (value && typeof value === 'object' && !Array.isArray(value)) {
			result[key] = merge(base[key] || {}, value);
		}
		else {
			result[key] = value;
		}
	});

	return result;
}

function load() {
	let fileConfig = {};

	if (fs.existsSync(CONFIG_PATH)) {
		fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
	}
	else {
		log.warn('No configuration file found; using defaults', { path: CONFIG_PATH });
	}

	return merge(DEFAULTS, fileConfig);
}

function readPath(object, dottedPath) {
	return dottedPath.split('.').reduce((value, key) => (value == null ? value : value[key]), object);
}

function validate(settings) {
	const missing = REQUIRED.filter((key) => {
		const value = readPath(settings, key);

		return value == null || value === '' || String(value).startsWith('YOUR_');
	});

	if (missing.length > 0) {
		throw new Error(
			`Missing configuration values: ${missing.join(', ')}. ` +
			`Copy config.example.json to ${CONFIG_PATH} and fill them in.`
		);
	}

	return settings;
}

module.exports = validate(load());
