const fs = require('fs');
const path = require('path');
const log = require('../logger');
const paths = require('../lib/paths');

const FILES = {
	lobby: 'lobby.json',
	kicked: 'kicked.json',
	openPolls: 'open polls.json',
	unfinishedPolls: 'unfinished polls.json',
	announcedEvents: 'announced events.json'
};

const folderRoot = paths.dataDir;

fs.mkdirSync(folderRoot, { recursive: true });

function getPath(key) {
	const filename = FILES[key];

	if (!filename) {
		throw new Error(`Unknown state file: ${key}`);
	}

	return path.join(folderRoot, filename);
}

function exists(key) {
	return fs.existsSync(getPath(key));
}

function load(key, fallback = null) {
	const file = getPath(key);

	if (!fs.existsSync(file)) {
		return fallback;
	}

	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	}
	catch (err) {
		log.error('Failed to read state', { file: file }, err);

		return fallback;
	}
}

function save(key, value, callback) {
	const file = getPath(key);

	fs.writeFile(file, JSON.stringify(value), 'utf8', (err) => {
		if (err) {
			log.error('Failed to write state', { file: file }, err);
		}

		if (callback) {
			callback(err);
		}
	});
}

function saveSync(key, value) {
	const file = getPath(key);

	try {
		fs.writeFileSync(file, JSON.stringify(value), 'utf8');
	}
	catch (err) {
		log.error('Failed to write state', { file: file }, err);
	}
}

module.exports = {
	folderRoot: folderRoot,
	files: FILES,
	getPath: getPath,
	exists: exists,
	load: load,
	save: save,
	saveSync: saveSync
};
