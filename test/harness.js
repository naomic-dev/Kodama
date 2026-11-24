const assert = require('assert');

let failures = 0;

async function test(name, fn) {
	try {
		await fn();
		console.log('ok - ' + name);
	}
	catch (err) {
		failures += 1;
		console.error('not ok - ' + name);
		console.error(err && err.stack ? err.stack : err);
	}
}

function finish() {
	if (failures > 0) {
		console.error(failures + ' test(s) failed');
		process.exitCode = 1;
		return;
	}

	console.log('all tests passed');
}

module.exports = {
	test: test,
	finish: finish,
	assert: assert
};
