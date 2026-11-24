const fs = require('fs');
const readline = require('readline');
const { RichEmbed } = require('discord.js');
const { google } = require('googleapis');
const config = require('../config');
const log = require('../logger');
const store = require('../store/jsonStore');
const { getChannel } = require('../lib/channels');
const { formatDateTime } = require('../lib/time');

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const TOKEN_PATH = 'token.json';

const EVENT_IMAGE_KEYS = {
	'main munch': 'mainMunch',
	'billiards': 'billiards',
	'billiards discussion': 'billiardsDiscussion',
	'wlgbt brunch': 'wlgbtBrunch',
	'wlgbt evening': 'wlgbtEvening',
	'crafts': 'crafts'
};

let oAuth2Client = null;

function setGoogleApiAuth() {
	if (!fs.existsSync('google_credentials.json')) {
		throw new Error(
			'Missing google_credentials.json. Copy google_credentials.example.json and add your Google OAuth client credentials.'
		);
	}

	const content = fs.readFileSync('google_credentials.json');
	const credentials = JSON.parse(content);
	const { client_secret, client_id, redirect_uris } = credentials.installed;
	oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

	if (!fs.existsSync(TOKEN_PATH)) {
		const authUrl = oAuth2Client.generateAuthUrl({
			access_type: 'offline',
			scope: SCOPES,
		});

		log.info('Authorize this app by visiting this URL', { url: authUrl });
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		rl.question('Enter the code from that page here: ', (code) => {
			rl.close();

			oAuth2Client.getToken(code, (err, token) => {
				if (err) return log.error('Failed to retrieve Google access token', err);

				oAuth2Client.setCredentials(token);

				// Store the token to disk for later program executions
				fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
					if (err) return log.error('Failed to store Google token', { path: TOKEN_PATH }, err);

					log.info('Google token stored', { path: TOKEN_PATH });
				});
			});
		});

		return;
	}

	const token = fs.readFileSync(TOKEN_PATH);

	oAuth2Client.setCredentials(JSON.parse(token));
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

		if (type.toLowerCase() == 'main munch') {
			embed.setTitle('The Main Munch')
				.setDescription('Friends, it\'s time for our largest monthly event, The Main Munch! \n\nDiscover and donate treasures at the Swap-and-Shop table.')
				.addField('Date', date)
				.addField('Location', 'Visit our event page to get the address!')
				.addField('Eligible Members', 'Everyone!')
				.addField('Cost', '$2 donation and individual checks (please be sure to support our venue and waitstaff)')
				.addField('Dress Code', 'Something nice or dress to impress!');
		}
		else if (type.toLowerCase() == 'billiards') {
			embed.setTitle('The Hidden Speakeasy Relaxed Meet')
				.setDescription('We\'re going to be meeting at our local billiard parlor for pool, board games, and drinks!')
				.addField('Date', date)
				.addField('Location', 'Visit our event page to get the address!')
				.addField('Eligible Members', 'Everyone!')
				.addField('Cost', '$2 donation, $10 event cost')
				.addField('Dress Code', 'Nice casual or dress to impress!');
		}
		else if (type.toLowerCase() == 'billiards discussion') {
			embed.setTitle('Discussion Group')
				.setDescription('We\'re going to be meeting at our local billiard parlor for a discussion group!')
				.addField('Date', date)
				.addField('Location', 'Visit our event page to get the address!')
				.addField('Eligible Members', 'Everyone!')
				.addField('Cost', '$5 event cost, $2 optional donation')
				.addField('Dress Code', 'Casual or dress to impress!');
		}
		else if (type.toLowerCase() == 'wlgbt brunch') {
			embed.setTitle('Women\'s and LGBT+ Sunday Brunch Munch :gay_pride_flag:')
				.setDescription('Join us for Sunday Brunch, where we celebrate women and the LGBT+ Community, especially those who may not feel as comfortable at our regular events. :pancakes:')
				.addField('Date', date)
				.addField('Location', 'Visit our event page to get the address!')
				.addField('Eligible Members', 'Women and members of the LGBT+ Community only!')
				.addField('Cost', '$2 donation and individual checks (please be sure to support our venue and waitstaff)')
				.addField('Dress Code', 'Casual or dress to impress!');
		}
		else if (type.toLowerCase() == 'wlgbt evening') {
			embed.setTitle('Women\'s and LGBT+ Evening Munch :gay_pride_flag:')
				.setDescription('Join us at our Evening Women\'s and LGBT+ Munch, where we celebrate women and the LGBT+ Community, especially those who may not feel as comfortable at our regular events.')
				.addField('Date', date)
				.addField('Location', 'Visit our event page to get the address!')
				.addField('Eligible Members', 'Women and members of the LGBT+ Community only!')
				.addField('Cost', '$2 donation and individual checks (please be sure to support our venue and waitstaff)')
				.addField('Dress Code', 'Casual or dress to impress!');
		}
		else if (type.toLowerCase() == 'crafts') {
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

				let announcedEventList = store.load('announcedEvents', []),
					updateAnnouncedEventsList = false;

				events.forEach((event) => {
					const announcedEvent = announcedEventList.find(e => e.id == event.id);

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
