const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const readline = require('readline');
const { RichEmbed } = require('discord.js');
const { google } = require('googleapis');
const config = require('../config');
const log = require('../logger');
const paths = require('../lib/paths');
const store = require('../store/jsonStore');
const { getChannel } = require('../lib/channels');
const { formatDateTime } = require('../lib/time');
const { parseAuthorizationResponse } = require('../lib/oauth');

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const CREDENTIALS_PATH = paths.googleCredentialsPath;
const TOKEN_PATH = paths.googleTokenPath;
const LOOPBACK_HOST = '127.0.0.1';

const EVENT_IMAGE_KEYS = {
	'main munch': 'mainMunch',
	'billiards': 'billiards',
	'billiards discussion': 'billiardsDiscussion',
	'wlgbt brunch': 'wlgbtBrunch',
	'wlgbt evening': 'wlgbtEvening',
	'crafts': 'crafts'
};

let oAuth2Client = null;

function sendBrowserMessage(res, status, title, message) {
	res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
	res.end(`<!doctype html><meta charset="utf-8"><title>${title}</title><h1>${title}</h1><p>${message}</p>`);
}

// Google blocked the out-of-band flow, so the authorization code comes back to
// a loopback server on this machine. On a headless host the browser cannot
// reach that server; the redirect URL in its address bar can be pasted instead.
function runLoopbackFlow(client) {
	return new Promise((resolve, reject) => {
		const expectedState = crypto.randomBytes(16).toString('hex');
		let redirectUri = null;
		let readlineInterface = null;
		let finished = false;

		const server = http.createServer((req, res) => {
			const requestUrl = new URL(req.url, `http://${LOOPBACK_HOST}`);
			const error = requestUrl.searchParams.get('error');

			if (error) {
				sendBrowserMessage(res, 400, 'Authorization failed', `Google returned ${error}.`);
				return fail(new Error(`Google authorization failed: ${error}`));
			}

			if (requestUrl.searchParams.get('state') !== expectedState) {
				sendBrowserMessage(res, 400, 'Authorization failed', 'The state parameter did not match.');
				return fail(new Error('Google authorization state did not match'));
			}

			sendBrowserMessage(res, 200, 'Kodama is authorized', 'You can close this tab and return to the terminal.');
			succeed(requestUrl.searchParams.get('code'));
		});

		function finish() {
			finished = true;
			server.close();

			if (readlineInterface) {
				readlineInterface.close();
			}
		}

		function fail(err) {
			if (finished) {
				return;
			}

			finish();
			reject(err);
		}

		function succeed(code) {
			if (finished) {
				return;
			}

			if (!code) {
				return fail(new Error('Google authorization response contained no code'));
			}

			finish();
			resolve({ code: code, redirectUri: redirectUri });
		}

		server.on('error', fail);

		server.listen(0, LOOPBACK_HOST, () => {
			const port = server.address().port;
			redirectUri = `http://${LOOPBACK_HOST}:${port}`;

			const authUrl = client.generateAuthUrl({
				access_type: 'offline',
				prompt: 'consent',
				scope: SCOPES,
				redirect_uri: redirectUri,
				state: expectedState
			});

			log.info('Authorize Kodama by visiting this URL', { url: authUrl });

			if (!process.stdin.isTTY) {
				log.info('Waiting for the OAuth redirect', { redirectUri: redirectUri });
				return;
			}

			readlineInterface = readline.createInterface({ input: process.stdin, output: process.stdout });
			readlineInterface.question('If the browser cannot reach this machine, paste the redirect URL or the code here: ', (answer) => {
				const parsed = parseAuthorizationResponse(answer);

				if (parsed.error) {
					return fail(new Error(`Google authorization failed: ${parsed.error}`));
				}

				if (parsed.state && parsed.state !== expectedState) {
					return fail(new Error('Google authorization state did not match'));
				}

				succeed(parsed.code);
			});
		});
	});
}

function exchangeCode(client, code, redirectUri) {
	return client.getTokenAsync({ code: code, redirect_uri: redirectUri });
}

async function setGoogleApiAuth() {
	if (!fs.existsSync(CREDENTIALS_PATH)) {
		throw new Error(
			`Missing Google OAuth client credentials at ${CREDENTIALS_PATH}. ` +
			'Copy google_credentials.example.json there and add your client_id and client_secret.'
		);
	}

	const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));

	if (!credentials.installed) {
		throw new Error(
			`${CREDENTIALS_PATH} is not a Desktop app OAuth client. ` +
			'Create an OAuth client of type "Desktop app" in Google Cloud Console and download its JSON.'
		);
	}

	oAuth2Client = new google.auth.OAuth2(credentials.installed.client_id, credentials.installed.client_secret);

	if (fs.existsSync(TOKEN_PATH)) {
		oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));

		return;
	}

	const authorization = await runLoopbackFlow(oAuth2Client);
	const tokenResponse = await exchangeCode(oAuth2Client, authorization.code, authorization.redirectUri);
	const token = tokenResponse.tokens;

	oAuth2Client.setCredentials(token);
	fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
	fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));

	log.info('Google token stored', { path: TOKEN_PATH });
}

function getAuth() {
	return oAuth2Client;
}

function newEventEmbed(event) {
	//Get the Type of the event from its description
	let startIndex = event.description.indexOf('[type:') + 6,
		endIndex = event.description.indexOf(']', startIndex);
	const type = event.description.substring(startIndex, endIndex);

	//Get the event listing link for the event from its description
	startIndex = event.description.indexOf('[url:') + 5;
	endIndex = event.description.indexOf(']', startIndex);
	let url = event.description.substring(startIndex, endIndex).trim();

	if (url.startsWith('<a')) {
		startIndex = event.description.indexOf('"', startIndex) + 1;
		endIndex = event.description.indexOf('"', startIndex);
		url = event.description.substring(startIndex, endIndex);
	}

	if (type && url) {
		const embed = new RichEmbed()
			.setColor(0x1abc9c)
			.setURL(url);

		const date = formatDateTime(event.start.dateTime, event.end.dateTime);

		if (type.toLowerCase() === 'main munch') {
			embed.setTitle('The Main Munch')
				.setDescription('Friends, it\'s time for our largest monthly event, The Main Munch! \n\nDiscover and donate treasures at the Swap-and-Shop table.')
				.addField('Date', date)
				.addField('Location', 'Visit our event page to get the address!')
				.addField('Eligible Members', 'Everyone!')
				.addField('Cost', '$2 donation and individual checks (please be sure to support our venue and waitstaff)')
				.addField('Dress Code', 'Something nice or dress to impress!');
		}
		else if (type.toLowerCase() === 'billiards') {
			embed.setTitle('The Hidden Speakeasy Relaxed Meet')
				.setDescription('We\'re going to be meeting at our local billiard parlor for pool, board games, and drinks!')
				.addField('Date', date)
				.addField('Location', 'Visit our event page to get the address!')
				.addField('Eligible Members', 'Everyone!')
				.addField('Cost', '$2 donation, $10 event cost')
				.addField('Dress Code', 'Nice casual or dress to impress!');
		}
		else if (type.toLowerCase() === 'billiards discussion') {
			embed.setTitle('Discussion Group')
				.setDescription('We\'re going to be meeting at our local billiard parlor for a discussion group!')
				.addField('Date', date)
				.addField('Location', 'Visit our event page to get the address!')
				.addField('Eligible Members', 'Everyone!')
				.addField('Cost', '$5 event cost, $2 optional donation')
				.addField('Dress Code', 'Casual or dress to impress!');
		}
		else if (type.toLowerCase() === 'wlgbt brunch') {
			embed.setTitle('Women\'s and LGBT+ Sunday Brunch Munch :gay_pride_flag:')
				.setDescription('Join us for Sunday Brunch, where we celebrate women and the LGBT+ Community, especially those who may not feel as comfortable at our regular events. :pancakes:')
				.addField('Date', date)
				.addField('Location', 'Visit our event page to get the address!')
				.addField('Eligible Members', 'Women and members of the LGBT+ Community only!')
				.addField('Cost', '$2 donation and individual checks (please be sure to support our venue and waitstaff)')
				.addField('Dress Code', 'Casual or dress to impress!');
		}
		else if (type.toLowerCase() === 'wlgbt evening') {
			embed.setTitle('Women\'s and LGBT+ Evening Munch :gay_pride_flag:')
				.setDescription('Join us at our Evening Women\'s and LGBT+ Munch, where we celebrate women and the LGBT+ Community, especially those who may not feel as comfortable at our regular events.')
				.addField('Date', date)
				.addField('Location', 'Visit our event page to get the address!')
				.addField('Eligible Members', 'Women and members of the LGBT+ Community only!')
				.addField('Cost', '$2 donation and individual checks (please be sure to support our venue and waitstaff)')
				.addField('Dress Code', 'Casual or dress to impress!');
		}
		else if (type.toLowerCase() === 'crafts') {
			embed.setTitle('Daytime Crafts and Potluck')
				.setDescription('Join us for a daytime arts and crafts party! :art:\n\nPlease remember to bring a potluck item to share. Extra points for homemade! *Gluten-free makes us happy!* :sparkling_heart:')
				.addField('Date', date + '\nCome when you can--No strict start time!')
				.addField('Location', 'Visit our event page to get the address!')
				.addField('Eligible Members', 'Everyone!')
				.addField('Cost', '$15')
				.addField('Dress Code', 'Casual or dress to impress!');
		}
		else {
			return null;
		}

		const imageKey = EVENT_IMAGE_KEYS[type.toLowerCase()];

		if (imageKey && config.eventImages[imageKey]) {
			embed.setImage(config.eventImages[imageKey]);
		}

		embed.addField('Don\'t forget to RSVP!', url);

		return embed;
	}

	return null;
}

function announceNextWeeksEvents(guild, auth) {
	const calendar = google.calendar({ version: 'v3', auth }),
		date = new Date();

	calendar.events.list({
		calendarId: config.google.calendarId,
		timeMin: date.toISOString(),
		timeMax: (new Date(date.setTime(date.getTime() + 7 * 86400000))).toISOString(),
		singleEvents: true,
		orderBy: 'startTime',
		q: config.google.eventQuery
	},
	(err, res) => {
		if (err) return log.error('Google Calendar API request failed', { calendarId: config.google.calendarId }, err);

		const events = res.data.items;

		if (events.length) {
			const channel = getChannel(guild, 'announcements');

			const announcedEventList = store.load('announcedEvents', []);

			let updateAnnouncedEventsList = false;

			events.forEach((event) => {
				const announcedEvent = announcedEventList.find(e => e.id === event.id);

				//Send embed and get its id

				if (!announcedEvent) {
					const embed = newEventEmbed(event);

					if (embed) {
						channel.send(embed)
							.catch(err => log.error('Failed to announce event', { eventId: event.id }, err));

						announcedEventList.push({ id: event.id });

						updateAnnouncedEventsList = true;
					}
				}
			});

			if (updateAnnouncedEventsList) {
				store.save('announcedEvents', announcedEventList);
			}
		}
	});
}

module.exports = {
	setGoogleApiAuth: setGoogleApiAuth,
	getAuth: getAuth,
	newEventEmbed: newEventEmbed,
	announceNextWeeksEvents: announceNextWeeksEvents
};
