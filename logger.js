const LEVELS = {
	error: 0,
	warn: 1,
	info: 2,
	debug: 3
};

const DEFAULT_LEVEL = 'info';
const DEFAULT_FORMAT = 'text';
const RESERVED_KEYS = ['time', 'level', 'message', 'error'];

function parseLevel(value) {
	const level = String(value || '').toLowerCase();

	return Object.prototype.hasOwnProperty.call(LEVELS, level) ? level : DEFAULT_LEVEL;
}

function parseFormat(value) {
	const format = String(value || '').toLowerCase();

	return (format === 'json' || format === 'text') ? format : DEFAULT_FORMAT;
}

const configuredLevel = parseLevel(process.env.LOG_LEVEL);
const configuredFormat = parseFormat(process.env.LOG_FORMAT);

function serializeError(error) {
	if (error == null) {
		return null;
	}

	if (error instanceof Error) {
		const serialized = {
			name: error.name,
			message: error.message
		};

		if (error.code != null) {
			serialized.code = error.code;
		}

		if (error.stack) {
			serialized.stack = error.stack;
		}

		return serialized;
	}

	return { message: String(error) };
}

function buildEntry(level, message, context, error) {
	const entry = {
		time: new Date().toISOString(),
		level: level,
		message: message
	};

	if (context && typeof context === 'object' && !(context instanceof Error)) {
		Object.keys(context).forEach((key) => {
			if (RESERVED_KEYS.indexOf(key) === -1) {
				entry[key] = context[key];
			}
		});
	}

	const serializedError = serializeError(error);

	if (serializedError) {
		entry.error = serializedError;
	}

	return entry;
}

function write(level, message, context, error) {
	if (LEVELS[level] > LEVELS[configuredLevel]) {
		return;
	}

	if (message instanceof Error) {
		error = message;
		message = message.message;
	}

	if (context instanceof Error && error == null) {
		error = context;
		context = null;
	}

	const entry = buildEntry(level, message, context, error);

	if (configuredFormat === 'json') {
		const line = JSON.stringify(entry);

		if (level === 'error' || level === 'warn') {
			console.error(line);
		}
		else {
			console.log(line);
		}

		return;
	}

	const contextKeys = Object.keys(entry).filter(key => RESERVED_KEYS.indexOf(key) === -1);
	let line = `[${entry.time}] ${level.toUpperCase().padEnd(5)} ${message}`;

	if (contextKeys.length > 0) {
		const contextObject = {};

		contextKeys.forEach((key) => {
			contextObject[key] = entry[key];
		});

		line += ' ' + JSON.stringify(contextObject);
	}

	if (entry.error) {
		line += ` :: ${entry.error.name ? entry.error.name + ': ' : ''}${entry.error.message}`;
	}

	if (level === 'error' || level === 'warn') {
		console.error(line);
	}
	else {
		console.log(line);
	}

	if (entry.error && entry.error.stack && level === 'error') {
		console.error(entry.error.stack);
	}
}

module.exports = {
	error: (message, context, error) => write('error', message, context, error),
	warn: (message, context, error) => write('warn', message, context, error),
	info: (message, context, error) => write('info', message, context, error),
	debug: (message, context, error) => write('debug', message, context, error)
};
