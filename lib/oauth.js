const LOOPBACK_HOST = '127.0.0.1';

// The loopback flow redirects the browser to this machine, so the code can be
// captured directly. On a headless host that page cannot load, and the user
// pastes whatever the address bar shows: a full URL, a bare query string, or
// just the code.
function parseAuthorizationResponse(value) {
	const trimmed = String(value || '').trim();
	let parsed = null;

	try {
		parsed = new URL(trimmed);
	}
	catch (err) {
		if (trimmed.includes('code=') || trimmed.includes('error=')) {
			parsed = new URL(`http://${LOOPBACK_HOST}/?${trimmed.replace(/^\?/, '')}`);
		}
	}

	if (parsed) {
		const code = parsed.searchParams.get('code');
		const error = parsed.searchParams.get('error');

		if (code || error) {
			return {
				code: code,
				error: error,
				state: parsed.searchParams.get('state')
			};
		}
	}

	return { code: trimmed, error: null, state: null };
}

module.exports = {
	parseAuthorizationResponse: parseAuthorizationResponse
};
