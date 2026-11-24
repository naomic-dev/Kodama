require('./setup');

const fs = require('fs');
const { test, finish, assert } = require('./harness');
const config = require('../config');
const store = require('../store/jsonStore');
const state = require('../store/state');
const { expireLobbyMembers } = require('../services/scheduler');

const dms = [];
const kicks = [];
const adminMessages = [];

function makeMember(id, roles) {
	return {
		id: id,
		roles: {
			get: (roleId) => (roles.indexOf(roleId) !== -1 ? roleId : null)
		},
		send: async (message) => {
			dms.push({ id: id, message: message });
		},
		kick: async () => {
			kicks.push(id);
		},
		toString: () => '<@' + id + '>'
	};
}

const members = [
	makeMember('1', [config.roles.member]),
	makeMember('2', [config.roles.member]),
	makeMember('4', [config.roles.admin])
];

state.guild = {
	members: {
		find: (predicate) => members.find(predicate)
	},
	channels: {
		find: () => ({
			send: (embed) => {
				adminMessages.push(embed);
				return Promise.resolve();
			}
		})
	}
};

(async () => {
	await test('expired members are kicked and active members or admins are kept', async () => {
		store.saveSync('lobby', [
			{ id: '1', expirationDate: '2026-01-01T00:00:00.000Z', message_id: 'm1' },
			{ id: '2', expirationDate: '2030-01-01T00:00:00.000Z', message_id: 'm2' },
			{ id: '3', expirationDate: '2026-01-01T00:00:00.000Z', message_id: 'm3' },
			{ id: '4', expirationDate: '2026-01-01T00:00:00.000Z', message_id: 'm4' }
		]);
		store.saveSync('kicked', []);

		const result = await expireLobbyMembers(new Date('2026-06-01T00:00:00.000Z'));

		assert.deepStrictEqual(kicks, ['1']);
		assert.deepStrictEqual(store.load('kicked', []), ['1']);
		assert.deepStrictEqual(state.lobbyList.map(l => l.id), ['2', '4']);
		assert.deepStrictEqual(store.load('lobby', []).map(l => l.id), ['2', '4']);
		assert.ok(result.kickedMembers.includes('<@1>'));
		assert.strictEqual(dms.filter(d => d.id === '1').length, 2);
		assert.strictEqual(adminMessages.length, 1);
	});

	await test('a second run is idempotent', async () => {
		const before = kicks.length;

		await expireLobbyMembers(new Date('2026-06-01T00:00:00.000Z'));

		assert.strictEqual(kicks.length, before);
		assert.deepStrictEqual(store.load('kicked', []), ['1']);
	});

	await test('no lobby file is a no-op', async () => {
		fs.unlinkSync(store.getPath('lobby'));

		const result = await expireLobbyMembers(new Date('2026-06-01T00:00:00.000Z'));

		assert.strictEqual(result.kickedMembers, '');
	});

	finish();
})();
