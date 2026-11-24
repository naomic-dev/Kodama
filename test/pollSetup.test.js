require('./setup');

const { test, finish, assert } = require('./harness');
const config = require('../config');
const store = require('../store/jsonStore');
const state = require('../store/state');
const { Poll, PollSetupData } = require('../models/poll');
const { handlePollSetup } = require('../commands/pollSetup');
const { schedulePollClosure } = require('../services/polls');

const edits = [];
const sent = [];
const pollMessage = {
	edit: (embed) => {
		edits.push(embed);
		return Promise.resolve();
	}
};
const channel = {
	id: 'chan',
	messages: {
		find: () => pollMessage
	},
	send: (embed) => {
		sent.push(embed);
		return Promise.resolve({ id: 'new-msg', react: async () => {} });
	}
};

state.guild = {
	channels: {
		find: () => channel
	},
	members: {
		find: () => ({ toString: () => 'Tester' })
	},
	emojis: {
		get: () => null
	}
};

const admin = {
	id: 'member-1',
	roles: {
		get: (id) => (id === config.roles.admin ? config.roles.admin : null)
	}
};

(async () => {
	await test('non-admin messages are ignored', () => {
		const member = {
			id: 'member-2',
			roles: { get: () => null }
		};

		assert.strictEqual(handlePollSetup({ content: 'x' }, member, 'x'), false);
	});

	await test('poll setup advances through all fields', () => {
		const poll = new Poll('member-1', new PollSetupData('chan', 'msg'), 'chan');
		state.unfinishedPollList = [poll];

		assert.strictEqual(handlePollSetup({ content: 'Lunch?' }, admin, 'lunch?'), true);
		assert.strictEqual(poll.title, 'Lunch?');

		assert.strictEqual(handlePollSetup({ content: 'Pick a place' }, admin, 'pick a place'), true);
		assert.strictEqual(poll.description, 'Pick a place');

		assert.strictEqual(handlePollSetup({ content: '1 hour' }, admin, '1 hour'), true);
		assert.ok(poll.expirationDate instanceof Date);

		assert.strictEqual(handlePollSetup({ content: 'yes' }, admin, 'yes'), true);
		assert.strictEqual(poll.optionsAreMutuallyExclusive, true);

		assert.strictEqual(handlePollSetup({ content: 'Pizza' }, admin, 'pizza'), true);
		assert.strictEqual(poll.options.length, 1);
		assert.strictEqual(poll.options[0].title, 'Pizza');
		assert.ok(edits.length >= 5);
	});

	await test('invalid duration keeps the expiration unset', () => {
		const poll = new Poll('member-1', new PollSetupData('chan', 'msg'), 'chan');
		poll.title = 'Lunch?';
		poll.description = 'Pick a place';
		state.unfinishedPollList = [poll];

		assert.strictEqual(handlePollSetup({ content: 'soon' }, admin, 'soon'), true);
		assert.strictEqual(poll.expirationDate, null);
	});

	await test('an expired poll is closed immediately', () => {
		const poll = new Poll('member-1', new PollSetupData(null, null), 'chan');
		poll.title = 'Old poll';
		poll.description = 'Done';
		poll.expirationDate = new Date('2020-01-01T00:00:00Z');
		poll.addOption('A');
		poll.options[0].memberIds.push('1');

		state.openPollList = [poll];
		sent.length = 0;

		schedulePollClosure(poll);

		assert.deepStrictEqual(state.openPollList, []);
		assert.strictEqual(sent.length, 1);
		assert.deepStrictEqual(store.load('openPolls', []), []);
	});

	finish();
})();
