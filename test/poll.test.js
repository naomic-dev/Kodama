require('./setup');

const { test, finish, assert } = require('./harness');
const { Poll } = require('../models/poll');

const guild = {
	members: {
		find: () => ({ toString: () => 'Tester' })
	},
	emojis: {
		get: (id) => '<:party:' + id + '>'
	}
};

(async () => {
	await test('constructor sets defaults', () => {
		const poll = new Poll('member-1');

		assert.strictEqual(poll.memberId, 'member-1');
		assert.strictEqual(poll.title, null);
		assert.strictEqual(poll.messageId, null);
		assert.deepStrictEqual(poll.options, []);
		assert.strictEqual(typeof poll.id, 'string');
	});

	await test('addOption appends a PollOption', () => {
		const poll = new Poll('member-1');

		poll.addOption('Pizza');

		assert.strictEqual(poll.options.length, 1);
		assert.strictEqual(poll.options[0].title, 'Pizza');
		assert.deepStrictEqual(poll.options[0].memberIds, []);
	});

	await test('unfinished description includes fields and options', () => {
		const poll = new Poll('member-1');

		poll.title = 'Lunch?';
		poll.description = 'Pick a place';
		poll.expirationDate = new Date('2026-12-01T12:00:00Z');
		poll.optionsAreMutuallyExclusive = false;
		poll.addOption('Pizza');

		const description = poll.getDescriptionForEmbed(guild);

		assert.ok(description.includes('By: Tester'));
		assert.ok(description.includes('Title: Lunch?'));
		assert.ok(description.includes('Description: Pick a place'));
		assert.ok(description.includes('Options mutually exclusive: No'));
		assert.ok(description.includes('Pizza'));
	});

	await test('finished description resolves custom emoji', () => {
		const poll = new Poll('member-1');

		poll.title = 'Lunch?';
		poll.description = 'Pick a place';
		poll.expirationDate = new Date('2026-12-01T12:00:00Z');
		poll.addOption('Pizza', { id: '123', name: 'party' });

		const description = poll.getDescriptionForEmbed(guild, 'finished');

		assert.ok(description.includes('By Tester'));
		assert.ok(description.includes('<:party:123>'));
		assert.ok(description.includes('Pizza'));
	});

	await test('closed description counts votes', () => {
		const poll = new Poll('member-1');

		poll.description = 'Pick a place';
		poll.addOption('Pizza');
		poll.options[0].memberIds.push('1', '2');

		const description = poll.getDescriptionForEmbed(guild, 'closed');

		assert.ok(description.includes('Final Results'));
		assert.ok(description.includes('Pizza'));
		assert.ok(description.includes('**2**'));
	});

	finish();
})();
