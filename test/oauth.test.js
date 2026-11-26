const { test, finish, assert } = require('./harness');
const { parseAuthorizationResponse } = require('../lib/oauth');

(async () => {
	await test('a full redirect URL yields the code and state', () => {
		const parsed = parseAuthorizationResponse('http://127.0.0.1:51234/?state=abc123&code=4/0AX4Xf&scope=https://www.googleapis.com/auth/calendar.readonly');

		assert.strictEqual(parsed.code, '4/0AX4Xf');
		assert.strictEqual(parsed.state, 'abc123');
		assert.strictEqual(parsed.error, null);
	});

	await test('a query string with a leading question mark is accepted', () => {
		const parsed = parseAuthorizationResponse('?code=4/0AX4Xf&state=abc123');

		assert.strictEqual(parsed.code, '4/0AX4Xf');
		assert.strictEqual(parsed.state, 'abc123');
	});

	await test('a query string without a leading question mark is accepted', () => {
		const parsed = parseAuthorizationResponse('code=4/0AX4Xf&state=abc123');

		assert.strictEqual(parsed.code, '4/0AX4Xf');
		assert.strictEqual(parsed.state, 'abc123');
	});

	await test('a bare authorization code is passed through', () => {
		const parsed = parseAuthorizationResponse('  4/0AX4Xf  ');

		assert.strictEqual(parsed.code, '4/0AX4Xf');
		assert.strictEqual(parsed.state, null);
		assert.strictEqual(parsed.error, null);
	});

	await test('an error redirect surfaces the Google error', () => {
		const parsed = parseAuthorizationResponse('http://127.0.0.1:51234/?error=access_denied&state=abc123');

		assert.strictEqual(parsed.code, null);
		assert.strictEqual(parsed.error, 'access_denied');
		assert.strictEqual(parsed.state, 'abc123');
	});

	await test('empty input yields an empty code', () => {
		assert.strictEqual(parseAuthorizationResponse('').code, '');
		assert.strictEqual(parseAuthorizationResponse(undefined).code, '');
		assert.strictEqual(parseAuthorizationResponse(null).code, '');
	});

	finish();
})();
