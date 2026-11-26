const { test, finish, assert } = require('./harness');
const { parseCommand } = require('../lib/prefix');

const BOT_ID = '598733841108303882';

(async () => {
	await test('kod! prefix yields the command', () => {
		assert.strictEqual(parseCommand('kod!help', BOT_ID), 'help');
	});

	await test('kodama! prefix yields the command', () => {
		assert.strictEqual(parseCommand('kodama!avatar @someone', BOT_ID), 'avatar');
	});

	await test('prefixes are matched case-insensitively', () => {
		assert.strictEqual(parseCommand('KOD!HELP', BOT_ID), 'help');
		assert.strictEqual(parseCommand('Kodama!Sa', BOT_ID), 'sa');
	});

	await test('arguments after the command are ignored', () => {
		assert.strictEqual(parseCommand('kod!help please now', BOT_ID), 'help');
	});

	await test('a bare prefix yields no command', () => {
		assert.strictEqual(parseCommand('kod!', BOT_ID), '');
		assert.strictEqual(parseCommand('kod!   ', BOT_ID), '');
	});

	await test('messages without a prefix are ignored', () => {
		assert.strictEqual(parseCommand('hello', BOT_ID), '');
		assert.strictEqual(parseCommand('kod help', BOT_ID), '');
		assert.strictEqual(parseCommand('please run kod!help', BOT_ID), '');
	});

	await test('a plain mention yields the command', () => {
		assert.strictEqual(parseCommand(`<@${BOT_ID}> help`, BOT_ID), 'help');
	});

	await test('a nickname mention yields the command', () => {
		assert.strictEqual(parseCommand(`<@!${BOT_ID}> avatar @someone`, BOT_ID), 'avatar');
	});

	await test('a mention without a separating space still parses', () => {
		assert.strictEqual(parseCommand(`<@${BOT_ID}>help`, BOT_ID), 'help');
	});

	await test('a bare mention asks for a command', () => {
		assert.strictEqual(parseCommand(`<@${BOT_ID}>`, BOT_ID), 'unsure');
		assert.strictEqual(parseCommand(`<@!${BOT_ID}>   `, BOT_ID), 'unsure');
	});

	await test('mentions of another user are ignored', () => {
		assert.strictEqual(parseCommand('<@999999999999999999> help', BOT_ID), '');
		assert.strictEqual(parseCommand('<@!999999999999999999> help', BOT_ID), '');
	});

	finish();
})();
