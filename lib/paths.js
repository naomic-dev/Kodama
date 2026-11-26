const os = require('os');
const path = require('path');

// Local configuration, credentials, and state live outside the repository, so
// a checkout never contains a secret and nothing writable sits in the tree.
// KODAMA_HOME moves the config/credential directory as a group; the per-file
// overrides below let a deployment place one file somewhere else.
const DEFAULT_HOME = path.join(os.homedir(), '.config', 'kodama');
const DEFAULT_DATA = path.join(os.homedir(), '.local', 'share', 'kodama');

function expandHome(value) {
	if (value === '~') {
		return os.homedir();
	}

	if (value.startsWith('~/')) {
		return path.join(os.homedir(), value.slice(2));
	}

	return value;
}

function resolveSetting(value, fallback) {
	return path.resolve(expandHome(value || '') || fallback);
}

function resolveHome() {
	return resolveSetting(process.env.KODAMA_HOME, DEFAULT_HOME);
}

// Getters keep every path late-bound, so values loaded from .env still apply.
module.exports = {
	get homeDir() {
		return resolveHome();
	},
	get configPath() {
		return resolveSetting(process.env.CONFIG_PATH, path.join(resolveHome(), 'config.json'));
	},
	get envPath() {
		return resolveSetting(process.env.ENV_FILE, path.join(resolveHome(), '.env'));
	},
	get googleCredentialsPath() {
		return resolveSetting(process.env.GOOGLE_CREDENTIALS_PATH, path.join(resolveHome(), 'google_credentials.json'));
	},
	get googleTokenPath() {
		return resolveSetting(process.env.GOOGLE_TOKEN_PATH, path.join(resolveHome(), 'token.json'));
	},
	get dataDir() {
		return resolveSetting(process.env.DATA_DIR, DEFAULT_DATA);
	}
};
