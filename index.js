require('dotenv').config();
const config = require('./config');
const log = require('./logger');
const { Client, RichEmbed } = require('discord.js');
const discordClient = new Client();
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const uuid = require('uuid/v1');

//Required for Google Calendar
const readline = require('readline');
const { google } = require('googleapis');
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const TOKEN_PATH = 'token.json';
let oAuth2Client = null;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

let guild = null;
let unfinishedPollList = [];
let openPollList = [];
let lobbyList = [];

//Look up a configured channel by name or ID
function getChannel(key) {
	const nameOrId = config.channels[key];

	return guild.channels.find(ch => ch.name === nameOrId || ch.id === nameOrId);
}

const EVENT_IMAGE_KEYS = {
	'main munch': 'mainMunch',
	'billiards': 'billiards',
	'billiards discussion': 'billiardsDiscussion',
	'wlgbt brunch': 'wlgbtBrunch',
	'wlgbt evening': 'wlgbtEvening',
	'crafts': 'crafts'
};

const EVENT_TAG_FORMAT_HELP = [
	'Add these tags to the calendar event description:',
	'[type:<event type>] — one of: main munch, billiards, billiards discussion, wlgbt brunch, wlgbt evening, crafts',
	'[url:<rsvp url>] — link shown in the RSVP field'
].join('\n');

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');

const folderRoot = (process.env.DEV == "true" ?
	path.join(dataDir, 'dev') :
	dataDir);

// Ensure the state directory exists before any read or write.
fs.mkdirSync(folderRoot, { recursive: true });

log.info('Starting Kodama', {
	dev: process.env.DEV === 'true',
	dataDirectory: folderRoot
});

discordClient.login(process.env.BOT_TOKEN);

//=========================================
class RsvpData {
	constructor(going = [], maybeGoing = [], notGoing = []) {
		this.going = going;
		this.maybeGoing = maybeGoing;
		this.notGoing = notGoing;
	}

	toString() {
		return "====Going====\n" +
			this.going.join("\n") + "\n\n" +
			"====Maybe Going====\n" +
			this.maybeGoing.join("\n") + "\n\n" +
			"====Not Going====\n" +
			this.notGoing.join("\n");
	}
};

class Poll {
	constructor(memberId, setupData = new PollSetupData(null, null), channelId = null, title = null, description = null, expirationDate = null, optionsAreMutuallyExclusive = null, options = []) {
		this.id = uuid();
		this.messageId = null;
		this.memberId = memberId;
		this.setupData = setupData;
		this.channelId = channelId;
		this.title = title;
		this.description = description;
		this.expirationDate = expirationDate;
		this.optionsAreMutuallyExclusive = optionsAreMutuallyExclusive;
		this.options = options;
	}

	addOption(title, emoji = null) {
		this.options.push(new PollOption(title, emoji));
	}

	getDescriptionForEmbed(status = 'unfinished') {
		let returnText = '';

		const member = guild.members.find(m => m.id == this.memberId);

		if (status == 'finished') {
			returnText += `By ${member}\n`;
			returnText += `Closes on ${formatDateTime(new Date(this.expirationDate))}\n\n`;
			returnText += `${this.description}\n\n`;

			this.options.forEach((option) => {
				const emoji = (option.emoji.id ? guild.emojis.get(option.emoji.id) : option.emoji.name);

				returnText += `${emoji}: \`${option.title}\`\n\n`;
			});
		}
		else if (status == 'unfinished') {
			returnText += `By: ${member}\n\n`;

			returnText += `Title: ${(this.title ? this.title : '')}\n`;
			returnText += `Description: ${(this.description ? this.description : '')}\n`;
			returnText += `Closes on: ${(this.expirationDate ? formatDateTime(new Date(this.expirationDate)) : '')}\n`;
			returnText += `Options mutually exclusive: ${(this.optionsAreMutuallyExclusive == null ? '' : (this.optionsAreMutuallyExclusive ? 'Yes' : 'No'))}\n`;
			returnText += 'Options:\n';

			if (this.options) {
				this.options.forEach((option) => {
					let emoji = '[None]';

					if (option.emoji) {
						emoji = (option.emoji.id ? guild.emojis.get(option.emoji.id) : option.emoji.name);
					}

					returnText += `${emoji}: \`${option.title}\`\n`;
				});
			}

			returnText += '\n';
		}
		else if (status == 'closed') {
			returnText += `By ${member}\n`;
			returnText += `${this.description}\n\n`;
			returnText += '__**Final Results:**__\n';

			this.options.forEach((option) => {

				returnText += `\`${option.title}\`: **${option.memberIds.length}**\n\n`;
			});
		}

		return returnText;
	}
}

class PollOption {
	constructor(title, emoji = null) {
		this.title = title;
		this.emoji = emoji;
		this.memberIds = [];
	}
}

class PollSetupData {
	constructor(channelId, messageId) {
		this.channelId = channelId;
		this.messageId = messageId;
	}
}

class OptionEmoji {
	constructor(name, id = null) {
		this.name = name;
		this.id = id;
	}
}

function admitMember(targetMember) {
	const adminOnlyChannel = getChannel('adminOnly'),
		adminOnlyEmbed = new RichEmbed()
			.setColor(0x1abc9c);

	if (targetMember) {
		const introductionsChannel = getChannel('introductions'),
			rulesChannel = getChannel('rules'),
			selfAssignRolesChannel = getChannel('selfAssignRoles'),
			infoAndFaqChannel = getChannel('infoAndFaq');

		targetMember.addRoles([config.roles.member, config.roles.dmsClosed])

		log.info('Member admitted', { memberId: targetMember.id, displayName: targetMember.displayName });

		adminOnlyEmbed.setTitle('A member has been admitted!');

		let adminOnlyEmbedDescription = `${targetMember.displayName} has been assigned the Member and DMs Closed roles.`;

		lobbyList = lobbyList.filter(loiterer => loiterer.id != targetMember.id);

		fs.writeFileSync(`${folderRoot}/lobby.json`, JSON.stringify(lobbyList), 'utf8');

		adminOnlyEmbedDescription += `\n\nRemoved ${targetMember.displayName} from \"lobby.json\"`;

		adminOnlyEmbed.setDescription(adminOnlyEmbedDescription);

		const introductionsEmbed = new RichEmbed()
			.setTitle('We\'ve got a new member!')
			.setColor(0x1abc9c)
			.setDescription(`${targetMember.displayName} joined the server. Welcome!`);

		const dmEmbed = new RichEmbed()
			.setTitle('Discord Orientation')
			.setColor(0x1abc9c)
			.setDescription(`Hi, ${targetMember.displayName}!\n\n**Here's a quick run-down on our rules:**\n1. This server is 18+ only.\n2. Do not post illegal content.\n3. Be a good person.\n\nThese aren't all of the rules, but they're the most important ones. A more comprehensive list can be found in ${rulesChannel}, so be sure to take a look when you can.\n\nIf you head to ${selfAssignRolesChannel}, you will find a list of roles (including pronouns and name colors) you can assign yourself. All you need to do is emoji react to the requisite role menus!\n\nIf you want to learn more about our server or Discord in general, head over to ${infoAndFaqChannel}.\n\nFinally, feel free to introduce yourself in ${introductionsChannel} and let everyone know a little bit about you.`);

		adminOnlyChannel.send(adminOnlyEmbed)
			.catch(err => log.error('Failed to post admission notice', { memberId: targetMember.id, channel: 'adminOnly' }, err));

		introductionsChannel.send(introductionsEmbed)
			.catch(err => log.error('Failed to post introduction', { memberId: targetMember.id, channel: 'introductions' }, err));

		targetMember.send(dmEmbed).then(() => {
			const dmConfirmEmbed = new RichEmbed()
				.setTitle('DM sent!')
				.setColor(0x1abc9c)
				.setDescription(`Successfully DM'd ${targetMember.displayName} a run-down of the rules.`);

			adminOnlyChannel.send(dmConfirmEmbed)
				.catch(err => log.error('Failed to confirm admission DM', { memberId: targetMember.id }, err));
		}).catch(err => log.error('Failed to DM admitted member', { memberId: targetMember.id }, err));
	}
	else {
		adminOnlyEmbed.setDescription(`User not found!`);

		adminOnlyChannel.send(adminOnlyEmbed)
			.catch(err => log.error('Failed to post not-found notice', { channel: 'adminOnly' }, err));
	}
}

function formatDateForRSVP(date) {
	const month = MONTH_NAMES[date.getMonth()],
		day = date.getDate(),
		year = date.getFullYear(),
		timeSuffix = date.getHours() > 11 ? "PM" : "AM";

	let time = formatTime(date);

	return month + ' ' + day + ', ' + year + " (" + time + ")";
}

function formatDateTime(startDateTime, endDateTime = null) {
	const startDate = new Date(Date.parse(startDateTime)),
		endDate = (endDateTime ? new Date(Date.parse(endDateTime)) : null),
		month = MONTH_NAMES[startDate.getMonth()],
		day = startDate.getDate(),
		year = startDate.getFullYear(),
		startTime = formatTime(startDate),
		endTime = (endDate ? formatTime(endDate) : null);

	return month + ' ' + day + ', ' + year + " (" + startTime + (endTime ? " to " + endTime : '') + ")";
}

function formatTime(date) {
	let hours = (date.getHours() % 12),
		minutes = date.getMinutes();

	const timeSuffix = date.getHours() > 11 ? "PM" : "AM";

	if (hours == 0) hours = 12;

	if (hours < 10) {
		hours = "0" + hours;
	}

	if (minutes < 10) {
		minutes = "0" + minutes;
	}

	return hours + ":" + minutes + " " + timeSuffix
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

function announceNextWeeksEvents(auth) {
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
				const channel = getChannel('announcements');

				let announcedEventList = [],
					updateAnnouncedEventsList = false;

				if (fs.existsSync(`${folderRoot}/announced events.json`)) {
					const content = fs.readFileSync(`${folderRoot}/announced events.json`);

					announcedEventList = JSON.parse(content);
				}

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
					fs.writeFile(`${folderRoot}/announced events.json`, JSON.stringify(announcedEventList), 'utf8', (err) => {
						if (err) {
							log.error('Failed to write announced events', { file: 'announced events.json' }, err);
						}
					});
				}
			}
		});
}

function addMissingSecretClubRoles() {
	const memberRoleId = config.roles.member,
		secretClubRoleId = config.roles.secretClub,
		vettedRoleId = config.roles.vetted,
		secretClubVettedRoleId = config.roles.secretClubVetted,
		admittedRoles = config.roles.admitted;

	guild.members.filter(m => m.roles.find(r => r.id == memberRoleId)).forEach((member) => {
		if (member.roles.some(r => admittedRoles.includes(r.id))) {
			if (!member.roles.find(r => r.id == secretClubRoleId)) {
				if (member.roles.find(r => r.id == vettedRoleId)) {
					member.addRoles([secretClubRoleId, secretClubVettedRoleId]);
				}
				else {
					member.addRole(secretClubRoleId);
				}
			}
		}
	});
}

function scheduleMidnightJobs() {
	const rule = new schedule.RecurrenceRule(null, null, null, null, 0, 0, 0);

	const job = schedule.scheduleJob(rule, async function () {
		if (fs.existsSync(`${folderRoot}/lobby.json`)) {
			const content = fs.readFileSync(`${folderRoot}/lobby.json`);

			lobbyList = JSON.parse(content);

			let updateLobbyListFile = false,
				updateKickedListFile = false,
				kickedMembers = '',
				kickedList = [];

			if (fs.existsSync(`${folderRoot}/kicked.json`)) {
				const kickedContent = fs.readFileSync(`${folderRoot}/kicked.json`);

				kickedList = JSON.parse(kickedContent);
			}

			const dmEmbed = new RichEmbed()
				.setTitle('You\'ve been removed from the server.')
				.setColor(0x1abc9c)
				.setDescription('Hi, friend!\n\nYou\'ve been removed our server because you were in the lobby for over a week without introducing yourself.\n\nYou\'re more than welcome to come back any time.');

			lobbyList.forEach(function (loiterer) {
				const member = guild.members.find(m => m.id == loiterer.id);

				if (member && member.roles.get(config.roles.admin) == null && new Date(loiterer.expirationDate) <= new Date()) {
					if (!kickedList.includes(member.id)) {
						kickedList.push(member.id);
					}

					updateKickedListFile = true;

					member.send(dmEmbed)
						.then(() => member.send('invite link'))
						.catch(err => log.warn('Failed to DM member being kicked', { memberId: member.id }, err))
						.then(() => member.kick())
						.catch(err => log.error('Failed to kick member', { memberId: member.id }, err));

					kickedMembers += member + '\n';

					lobbyList = lobbyList.filter(l => l.id != loiterer.id);
					updateLobbyListFile = true;
				}
				else if (!member) {
					lobbyList = lobbyList.filter(l => l.id != loiterer.id);
					updateLobbyListFile = true;
				}
			});

			if (updateLobbyListFile) {
				fs.writeFile(`${folderRoot}/lobby.json`, JSON.stringify(lobbyList), 'utf8', (err) => {
					if (err) {
						log.error('Failed to write lobby state', { file: 'lobby.json' }, err);
					}
				});
			}

			if (updateKickedListFile) {
				fs.writeFileSync(`${folderRoot}/kicked.json`, JSON.stringify(kickedList), 'utf8');
			}

			if (kickedMembers != '') {
				const adminOnlyChannel = getChannel('adminOnly'),
					embed = new RichEmbed()
						.setTitle('The following members were kicked from the lobby!')
						.setColor(0x1abc9c)
						.setDescription(kickedMembers);

				adminOnlyChannel.send(embed)
					.catch(err => log.error('Failed to post lobby kick summary', { channel: 'adminOnly' }, err));
			}
		}

		announceNextWeeksEvents(oAuth2Client);

		addMissingSecretClubRoles();

		log.info('Midnight job complete');
	});
}

function closePoll(poll) {
	Object.setPrototypeOf(poll, Poll.prototype);

	const channel = guild.channels.find(ch => ch.id == poll.channelId),
		embed = new RichEmbed()
			.setTitle(`Poll '${poll.title}' has closed!`)
			.setColor(0x1abc9c)
			.setDescription(poll.getDescriptionForEmbed('closed'));

	if (channel) {
		channel.send(embed)
			.catch(err => log.error('Failed to post poll results', { pollId: poll.id, channelId: poll.channelId }, err));
	}

	openPollList = openPollList.filter(p => p.id != poll.id);

	try {
		fs.writeFileSync(`${folderRoot}/open polls.json`, JSON.stringify(openPollList), 'utf8');
	}
	catch (err) {
		log.error('Failed to write open polls', { file: 'open polls.json' }, err);
	}
}

function schedulePollClosure(poll) {
	const expiration = new Date(poll.expirationDate);

	//Close polls that expired while the bot was offline instead of scheduling a job in the past.
	if (Number.isNaN(expiration.getTime()) || expiration.getTime() <= Date.now()) {
		log.info('Closing expired poll', { pollId: poll.id, title: poll.title, expirationDate: poll.expirationDate });

		closePoll(poll);
		return;
	}

	schedule.scheduleJob(expiration, () => closePoll(poll));
}

function schedulePollClosures() {
	openPollList.slice().forEach(poll => schedulePollClosure(poll));
}

function scheduleIdleBreaker() {
	const rule = new schedule.RecurrenceRule(null, null, null, null, null, 0, 0),
		channel = getChannel('kodamaTest'),
		job = schedule.scheduleJob(rule, async function () {
			channel.startTyping();
			log.debug('Keep-alive typing indicator started');
			channel.stopTyping();
			log.debug('Keep-alive typing indicator finished');
		});
}

discordClient.on('error', err => log.error('Discord client error', err));

discordClient.on('ready', async () => {
	guild = discordClient.guilds.find(g => g.id === config.guildId)

	if (!guild) {
		log.error('Configured guild not found', { guildId: config.guildId });
		process.exit(1);
	}

	discordClient.user.setPresence({
		game: {
			name: 'kod!help | The forest\'s little helper',
			type: 'PLAYING'
		}
	});

	log.info('Discord presence set', { activity: 'kod!help | The forest\'s little helper' });

	await setGoogleApiAuth();

	log.info('Google API authentication ready');

	scheduleMidnightJobs();

	log.info('Scheduled midnight jobs');

	if (fs.existsSync(`${folderRoot}/open polls.json`)) {
		const content = fs.readFileSync(`${folderRoot}/open polls.json`);

		openPollList = JSON.parse(content);

		log.info('Loaded state', { file: 'open polls.json', count: openPollList.length });
	}

	if (fs.existsSync(`${folderRoot}/unfinished polls.json`)) {
		const content = fs.readFileSync(`${folderRoot}/unfinished polls.json`);

		unfinishedPollList = JSON.parse(content);

		log.info('Loaded state', { file: 'unfinished polls.json', count: unfinishedPollList.length });
	}

	if (fs.existsSync(`${folderRoot}/lobby.json`)) {
		const content = fs.readFileSync(`${folderRoot}/lobby.json`);

		lobbyList = JSON.parse(content);

		log.info('Loaded state', { file: 'lobby.json', count: lobbyList.length });
	}

	schedulePollClosures();

	log.info('Scheduled poll closures', { openPolls: openPollList.length });

	log.info('Startup complete', { user: discordClient.user.tag, guildId: config.guildId, guildName: guild.name });
});

discordClient.on('message', msg => {
	const member = msg.member,
		contentToLowerCase = msg.content.toLowerCase();

	if (msg.channel.type == 'dm' && msg.author.id != discordClient.user.id) {
		const channel = getChannel('adminOnly'),
			embed = new RichEmbed()
			.setColor(0x1abc9c)
			.setTitle(`${msg.author.username} sent Kodama a DM`);

		let embedDescription = `**From:**\n${msg.author}\n\n**Content:**\n${msg.content}`;

		if (msg.attachments.length == 1) {
			embed.setImage(msg.attachments.first().url);
		}
		else if (msg.attachments.length > 1) {
			embedDescription += '\n\n**Attachments:**\n';

			msg.attachments.forEach((attachment) => {
				embedDescription += attachment.url + '\n';
			});

			embed.setImage(msg.attachments.first().url)
		}

		embed.setDescription(embedDescription);

		channel.send(embed);
	}
	else {
		let allowCommands = true;
		let command = '',
			messageBody = '';

		if (msg.content.startsWith(`<@!${discordClient.user.id}>`)) {
			if (msg.content.includes(' ')) {
				messageBody = msg.content.substr(msg.content.indexOf(' ') + 1);

				if (messageBody.includes(' ')) {
					command = messageBody.substr(messageBody.indexOf(' ') + 1).toLowerCase();
				}
				else {
					command = messageBody;
				}
			}
			else {
				command = 'unsure';
			}
		}
		else if (contentToLowerCase.startsWith('kod!') || contentToLowerCase.startsWith('kodama!')) {
			if (msg.content.includes(' ')) {
				const spaceIndex = msg.content.indexOf(' ');

				command = contentToLowerCase.substring(msg.content.indexOf('!') + 1, spaceIndex);

				messageBody = msg.content.substr(spaceIndex + 1);
			}
			else {
				command = contentToLowerCase.substr(msg.content.indexOf('!') + 1);
			}
		}

		if (member && member.roles.get(config.roles.admin)) {
			const poll = (unfinishedPollList.length > 0 ? unfinishedPollList.find(p => p.memberId == member.id) : null);

			if (poll) {
				Object.setPrototypeOf(poll, Poll.prototype);

				allowCommands = false;

				const pollListIndex = unfinishedPollList.findIndex(p => p.memberId == member.id),
					embed = new RichEmbed()
						.setColor(0x1abc9c);

				let updateUnfinishedList = true;

				if (poll.title == null) {
					poll.title = (msg.content == 'none' ? '' : msg.content);

					embed.setDescription(poll.getDescriptionForEmbed() + '**Next: Type out a description for your poll.**');

				}
				else if (poll.description == null) {
					poll.description = (msg.content == 'none' ? '' : msg.content);

					embed.setDescription(poll.getDescriptionForEmbed() + '**Next: Type out a poll duration.**\n\n*Ex: 1 hour\nEx: 4 days*');
				}
				else if (poll.expirationDate == null) {
					const date = new Date();

					let amount = null,
						amountValid = false;

					if (msg.content.includes('hr') || msg.content.includes('hour')) {
						amount = Number.parseInt(msg.content.substring(0, msg.content.indexOf('h')).trim());

						if (amount && !Number.isNaN(amount)) {
							poll.expirationDate = new Date(date.setTime(date.getTime() + amount * 3600000));
							amountValid = true;
						}
					}
					else if (msg.content.includes('day')) {
						amount = Number.parseInt(msg.content.substring(0, msg.content.indexOf('d')).trim());

						if (amount && !Number.isNaN(amount)) {
							poll.expirationDate = new Date(date.setTime(date.getTime() + amount * 86400000));
							amountValid = true;
						}
					}

					if (amountValid) {
						embed.setDescription(poll.getDescriptionForEmbed() + '**Next: Should options on this poll be mutually exclusive?**\nIf "yes", users will only be able to pick one option at a time.');
					}
					else {
						updateUnfinishedList = false;

						embed.setDescription(poll.getDescriptionForEmbed() + '**ERROR: Poll duration syntax error!\n\nNext: Type out a poll duration.**\n\n*Ex: 1 hour\nEx: 4 days*')
							.setColor(0xe91e63);
					}
				}
				else if (poll.optionsAreMutuallyExclusive == null) {
					if (contentToLowerCase == 'yes' || contentToLowerCase == 'y' || contentToLowerCase == 'true' || contentToLowerCase == 't') {
						poll.optionsAreMutuallyExclusive = true;
					}
					else if (contentToLowerCase == 'no' || contentToLowerCase == 'n' || contentToLowerCase == 'false' || contentToLowerCase == 'f') {
						poll.optionsAreMutuallyExclusive = false;
					}
					else {
						updateUnfinishedList = false;
						embed.setDescription(poll.getDescriptionForEmbed() + '**ERROR: response must be one of the following:**\nyes, y, true, t\nno, n, false, f\n\n**Next: Should options on this poll be mutually exclusive?**\nIf "yes", users will only be able to pick one option at a time.**')
							.setColor(0xe91e63);;
					}

					if (poll.optionsAreMutuallyExclusive != null) {
						embed.setDescription(poll.getDescriptionForEmbed() + '**Next: Type out a voting option for your poll.**');
					}
				}
				else if ((poll.options.length == 0 || poll.options[poll.options.length - 1].emoji != null) && contentToLowerCase != '[done]') {
					poll.addOption(msg.content);

					embed.setDescription(poll.getDescriptionForEmbed() + '**Next: React with an emoji for this option.**\n\nNote: The emoji must be a default emoji or a custom emoji from this server.');
				}

				if (poll.options.length > 1 && poll.options[poll.options.length - 1].emoji != null && contentToLowerCase == '[done]') {
					const newPollEmbed = new RichEmbed()
						.setColor(0x1abc9c)
						.setTitle('Poll: ' + poll.title)
						.setDescription(poll.getDescriptionForEmbed('finished'));

					embed.setTitle('Poll Set Up Complete!');

					unfinishedPollList = unfinishedPollList.filter(p => p.memberId != member.id);

					if (fs.existsSync(`${folderRoot}/open polls.json`)) {
						const content = fs.readFileSync(`${folderRoot}/open polls.json`);

						openPollList = JSON.parse(content);
					}

					const channel = guild.channels.find(ch => ch.id == poll.channelId)

					if (!channel) {
						log.error('Poll channel not found', { pollId: poll.id, channelId: poll.channelId });
						return;
					}

					channel.send(newPollEmbed)
						.then((newPollMessage) => {
							poll.messageId = newPollMessage.id;

							openPollList.push(poll);

							fs.writeFile(`${folderRoot}/open polls.json`, JSON.stringify(openPollList), 'utf8', (err) => {
								if (err) {
									log.error('Failed to write open polls', { file: 'open polls.json' }, err);
								}
							});

							poll.options.forEach(async (option) => {
								const emoji = (option.emoji.id ? guild.emojis.get(option.emoji.id) : option.emoji.name);

								try {
									await newPollMessage.react(emoji);
								}
								catch (err) {
									log.error('Failed to add poll option reaction', { pollId: poll.id, option: option.title }, err);
								}
							});

							schedulePollClosure(poll);

							log.info('Poll opened', { pollId: poll.id, title: poll.title, channelId: poll.channelId, expiresAt: poll.expirationDate });
						})
						.catch(err => log.error('Failed to post poll', { pollId: poll.id, channelId: poll.channelId }, err));
				}
				else {
					embed.setTitle('New Poll Set Up');

					const pollSetupChannel = guild.channels.find(ch => ch.id == poll.setupData.channelId),
						pollMessage = (pollSetupChannel ? pollSetupChannel.messages.find(m => m.id == poll.setupData.messageId) : null);

					if ((poll.options.length <= 1 || poll.options[poll.options.length - 1].emoji == null) && contentToLowerCase == '[done]') {
						let errorMessage = '';

						if (poll.options.length == 0 || (poll.options.length == 1 && (poll.options[0].emoji != null))) {
							errorMessage = '**ERROR: You must have a total of two or more voting options!\n\nNext: Type out a voting option for your poll.**'
						}
						else {
							errorMessage = '**ERROR: You must react to this message with an emoji before you can finish this poll!\n\nNext: React with an emoji for this option.**\n\nNote: The emoji must be a default emoji or a custom emoji from this server.'
						}

						embed.setColor(0xe91e63)
							.setDescription(poll.getDescriptionForEmbed() + errorMessage);

						updateUnfinishedList = false;
					}

					if (pollMessage) {
						if (updateUnfinishedList) {
							unfinishedPollList[pollListIndex] = poll;
						}

						pollMessage.edit(embed)
							.catch(err => log.error('Failed to update poll setup message', { pollId: poll.id }, err));
					}
					else {
						updateUnfinishedList = false;

						pollSetupChannel.send(embed)
							.then((newPollMessage) => {
								poll.setupData = new PollSetupData(newPollMessage.channel.id, newPollMessage.id);
								unfinishedPollList[pollListIndex] = poll;

								fs.writeFile(`${folderRoot}/unfinished polls.json`, JSON.stringify(unfinishedPollList), 'utf8', (err) => {
									if (err) {
										log.error('Failed to write unfinished polls', { file: 'unfinished polls.json' }, err);
									}
								});
							})
							.catch(err => log.error('Failed to post poll setup message', { pollId: poll.id }, err));
					}
				}

				if (updateUnfinishedList) {
					fs.writeFile(`${folderRoot}/unfinished polls.json`, JSON.stringify(unfinishedPollList), 'utf8', (err) => {
						if (err) {
							log.error('Failed to write unfinished polls', { file: 'unfinished polls.json' }, err);
						}
					});
				}
			}
		}

		if (member && member.roles.get(config.roles.admin)) {
			if (allowCommands) {
				if (msg.content.toLowerCase().startsWith('!admit')) {
					const targetUser = msg.mentions.users.first();

					let targetMember = null;

					if (targetUser) {
						targetMember = guild.member(targetUser);
					}
					else {
						const username = msg.content.substr(msg.content.indexOf(' ') + 1);

						targetMember = guild.members.find(m => m.displayName.toLowerCase() == username.toLowerCase());
					}

					admitMember(targetMember);

					allowCommands = false;
				}
				else if (msg.content.toLowerCase().startsWith('!poll')) {
					const setupChannel = getChannel('adminOnly'),
						announcementsChannel = getChannel('announcements'),
						channel = msg.mentions.channels.first(),
						embed = new RichEmbed()
							.setColor(0x1abc9c)
							.setTitle('New Poll Set Up')
							.setDescription(`Creator: ${member}\n\nTitle:\nDescription:\nExpiration Date:\nOptions:\n\n**Select a title for your poll**`);

					setupChannel.send(embed)
						.then((pollMessage) => {
							const targetChannelId = (channel ? channel.id : announcementsChannel.id);

							unfinishedPollList.push(new Poll(member.id, new PollSetupData(setupChannel.id, pollMessage.id), targetChannelId));

							fs.writeFile(`${folderRoot}/unfinished polls.json`, JSON.stringify(unfinishedPollList), 'utf8', (err) => {
								if (err) {
									log.error('Failed to write unfinished polls', { file: 'unfinished polls.json' }, err);
								}
							});

							log.info('Poll setup started', { memberId: member.id, channelId: targetChannelId });
						})
						.catch(err => log.error('Failed to start poll setup', { memberId: member.id }, err));

					allowCommands = false;
				}
				else if (member.id == config.ownerId && msg.content.toLowerCase().startsWith('!say')) {
					const channel = msg.mentions.channels.first(),
						kodamaMessage = msg.content.substring(msg.content.indexOf(' ', msg.content.indexOf(' ') + 1) + 1).trim(),
						embed = new RichEmbed()
							.setColor(0x1abc9c)
							.setDescription(kodamaMessage);

					channel.send(embed);

					allowCommands = false;
				}
				else if (member.id == config.ownerId && msg.content.toLowerCase() == '!ping') {
					const channel = getChannel('kodamaTest'),
						embed = new RichEmbed()
							.setColor(0x1abc9c)
							.setDescription('Pong!');

					channel.send(embed);

					allowCommands = false;
				}
				else if (member.id == config.ownerId && msg.content.toLowerCase().startsWith('!announce-events')) {
					announceNextWeeksEvents(oAuth2Client);

					allowCommands = false;
				}
				else if (member.id == config.ownerId && msg.content.toLowerCase() == '!event-tag-format') {
					const channel = getChannel('kodamaTest'),
						embed = new RichEmbed()
							.setColor(0x1abc9c)
							.setTitle('Event Tag Format for Google Calendar')
							.setDescription(EVENT_TAG_FORMAT_HELP);

					channel.send(embed);

					allowCommands = false;
				}
				else if (member.id == config.ownerId && msg.content.toLowerCase() == '!update-introduction') {
					const channel = getChannel('announcements'),
						embed = new RichEmbed()
							.setColor(0x1abc9c)
							.setTitle('Hi, I\'m Kodama!')
							.setDescription('Hello, @everyone! I\'m Kodama.\n\nI\'m a bot Naomi created to help out around the server. I don\'t do a whole lot right now, but Nae\'s adding to me little by little every day!\n\nFind out what I can do with the command \`\`\`kod!help\`\`\`');

					channel.fetchMessage(config.messages.introduction)
						.then(messageToEdit => {
							messageToEdit.edit(embed)
								.catch(err => log.error('Failed to update introduction message', { messageId: config.messages.introduction }, err));
						})
						.catch(err => log.error('Failed to fetch introduction message', { messageId: config.messages.introduction }, err));

					allowCommands = false;
				}
				else if (member.id == config.ownerId && msg.content.toLowerCase().startsWith('!add-to-lobby-list') && msg.content.includes(' ')) {
					const channel = getChannel('kodamaTest'),
						username = msg.content.substr(msg.content.indexOf(' ') + 1).trim(),
						targetMember = guild.members.find(m => m.displayName == username),
						embed = new RichEmbed()
							.setColor(0x1abc9c)
							.setTitle('Member Added to Lobby List!');

					if (targetMember) {
						log.info('Adding member to lobby list', { memberId: targetMember.id, displayName: targetMember.displayName });

						let expirationDate = targetMember.joinedAt;

						expirationDate = new Date(expirationDate.setTime(expirationDate.getTime() + 7 * 86400000));

						expirationDate.setHours(23, 59, 59, 999);

						lobbyList = lobbyList.filter(loiterer => loiterer.id != targetMember.id);

						embed.setDescription(`Added ${targetMember.displayName} to \"lobby.json\"\n`);
						channel.send(embed)
							.then((msg) => {
								lobbyList.push({ id: targetMember.id, expirationDate: expirationDate, message_id: msg.id });

								fs.writeFile(`${folderRoot}/lobby.json`, JSON.stringify(lobbyList), 'utf8', function (err) {
									if (err) {
										log.error('Failed to write lobby state', { file: 'lobby.json' }, err);
									}
								});
							})
							.catch(err => log.error('Failed to post lobby list notice', { channel: 'kodamaTest' }, err));


					}
					else {
						log.warn('Could not find member for lobby list', { username: username });

						embed.setTitle('Member not found!')
							.setDescription(`Could not find user ${username}`);

						channel.send(embed)
							.catch(err => log.error('Failed to post lobby list notice', { channel: 'kodamaTest' }, err));
					}

					allowCommands = false;
				}
				else if (member.id == config.ownerId && msg.content.toLowerCase() == '!check-lobby-list') {
					(async function () {
						let updateLobbyListFile = false,
							kickedMembers = '';

						lobbyList.forEach(function (loiterer) {
							const member = guild.members.find(m => m.id == loiterer.id);

							log.debug('Checking lobby entry', { memberId: loiterer.id, expiresAt: loiterer.expirationDate });

							if (member && new Date(loiterer.expirationDate) <= new Date()) {
								kickedMembers += member + '\n';

								lobbyList = lobbyList.filter(l => l.id != loiterer.id);

								updateLobbyListFile = true;
							}
							else if (!member) {
								lobbyList = lobbyList.filter(l => l.id != loiterer.id);

								updateLobbyListFile = true;
							}
						});

						if (updateLobbyListFile) {
							fs.writeFile(`${folderRoot}/lobby.json`, JSON.stringify(lobbyList), 'utf8', (err) => {
								if (err) {
									log.error('Failed to write lobby state', { file: 'lobby.json' }, err);
								}
							});
						}

						if (kickedMembers != '') {
							const channel = getChannel('kodamaTest'),
								embed = new RichEmbed()
									.setTitle('The following members should be kicked from the lobby!')
									.setColor(0x1abc9c)
									.setDescription(kickedMembers);

							channel.send(embed)
								.catch(err => log.error('Failed to post lobby check result', { channel: 'kodamaTest', result: 'kicks' }, err));
						}
						else {
							const channel = getChannel('kodamaTest'),
								embed = new RichEmbed()
									.setTitle('No one to kick from the lobby!')
									.setColor(0x1abc9c)
									.setDescription(':shrug:');

							channel.send(embed)
								.catch(err => log.error('Failed to post lobby check result', { channel: 'kodamaTest', result: 'none' }, err));
						}
					})();

					allowCommands = false;
				}
			}
		}

		if (allowCommands && command != '' && member && member.roles.get(config.roles.admin)) {
			if (command == 'help' || command == 'h') {
				const channel = getChannel('botSpam'),
					embed = new RichEmbed()
						.setTitle('Kodama Help Menu')
						.setColor(0x1abc9c)
						.setDescription(`${msg.member} here is a list of commands you can give me:\n\n__Command Syntax__\`\`\`@Kodama h\nkodama!h\nkod!h\`\`\`\n\nDisplay Help Menu:\`\`\`\nhelp\nh\`\`\`\n\nDisplay Server's avatar:\`\`\`\nserver-avatar\nsa\`\`\`\n\nDisplay a given user's avatar:\`\`\`avatar @user\na @user\`\`\`\n\nStart a poll (admins):\`\`\`\n!poll [#channel]\`\`\``);

				channel.send(embed)
					.catch(err => log.error('Failed to post help menu', { channel: 'botSpam' }, err));
			}
			else if (command == 'server-avatar' || command == 'sa') {
				const channel = getChannel('botSpam'),
					embed = new RichEmbed()
						.setTitle('Server Avatar')
						.setColor(0x1abc9c)
						.setDescription(msg.member)
						.setImage(msg.guild.iconURL);

				channel.send(embed)
					.catch(err => log.error('Failed to post server avatar', { channel: 'botSpam' }, err));
			}
			else if (command == 'avatar' || command == 'a') {
				const channel = getChannel('botSpam'),
					mentions = msg.mentions,
					mentionedUser = mentions.users.filter(u => u.id != discordClient.user.id).first();

				if (mentionedUser) {
					const mentionedMember = mentions.members.first(),
						embed = new RichEmbed()
						.setTitle(`${mentionedMember.displayName}'s Avatar`)
						.setColor(0x1abc9c)
						.setDescription(msg.member)
						.setImage(mentionedUser.avatarURL);

					channel.send(embed)
						.catch(err => log.error('Failed to post member avatar', { channel: 'botSpam', memberId: mentionedMember.id }, err));
				}
				else {
					const embed = new RichEmbed()
						.setTitle('Command Syntax Error')
						.setColor(0xe91e63)
						.setDescription(`${msg.member}\nThe correct syntax for the command is\n\`\`\`kod!icon {user mention}\`\`\``);

					channel.send(embed)
						.catch(err => log.error('Failed to post avatar syntax error', { channel: 'botSpam' }, err));
				}
			}
		}
	}
});

discordClient.on('guildMemberAdd', member => {
	log.info('Member joined', { memberId: member.id, displayName: member.displayName });

	const welcomeChannel = getChannel('welcome'),
		theLobbyChannel = getChannel('lobby'),
		adminOnlyChannel = getChannel('adminOnly'),
		dmEmbed = new RichEmbed()
			.setTitle('Welcome to our server!')
			.setColor(0x1abc9c)
			.setDescription(`Hi, ${member.displayName}! My name is Kodama. I'm a chat bot created to help out around the server.\n\nBe sure to read ${welcomeChannel} to get yourself up to speed.\n\nA few notes before you go, though:\n\nA) **This server is intended for adults only.**\n\nB) Before we let you into the rest of the channels in the server, we ask that you introduce yourself in ${theLobbyChannel} and let us know what your name is.`)
			.addField('If we cannot verify you within one week, you will be booted from the server.', 'This is just to keep the lobby clear of loiterers; You\'re free to rejoin any time!'),
		adminOnlyEmbed = new RichEmbed()
			.setTitle('A member joined!')
			.setColor(0x1abc9c)
			.setDescription(`${member.displayName} Joined the server!`);

	let expirationDate = member.joinedAt;

	expirationDate = new Date(expirationDate.setTime(expirationDate.getTime() + 7 * 86400000));

	expirationDate.setHours(23, 59, 59, 999);

	lobbyList = lobbyList.filter(loiterer => loiterer.id != member.id);

	dmEmbed.addField('Lobby Removal Date', formatDateForRSVP(expirationDate));

	member.send(dmEmbed)
		.then(() => {
			const dmConfirmEmbed = new RichEmbed()
				.setTitle('DM sent!')
				.setColor(0x1abc9c)
				.setDescription(`Sent ${member.displayName} an introduction to the server.`);

			adminOnlyChannel.send(dmConfirmEmbed)
				.catch(err => log.error('Failed to confirm welcome DM', { memberId: member.id }, err));
		})
		.catch(err => log.warn('Failed to DM new member', { memberId: member.id }, err));

	adminOnlyChannel.send(adminOnlyEmbed)
		.then((msg) => {
			lobbyList.push({ id: member.id, expirationDate: expirationDate, message_id: msg.id });

			fs.writeFile(`${folderRoot}/lobby.json`, JSON.stringify(lobbyList), 'utf8', (err) => {
				if (err) {
					log.error('Failed to write lobby state', { file: 'lobby.json' }, err);
				}
				else {
					log.info('Added member to lobby', { memberId: member.id, displayName: member.displayName, expiresAt: expirationDate.toISOString() });
				}
			});
		})
		.catch(err => log.error('Failed to post join notice', { memberId: member.id, channel: 'adminOnly' }, err));
});

discordClient.on('guildMemberRemove', member => {
	log.info('Member left', { memberId: member.id });

	let kickedList = [];

	if (fs.existsSync(`${folderRoot}/kicked.json`)) {
		const kickedContent = fs.readFileSync(`${folderRoot}/kicked.json`);

		kickedList = JSON.parse(kickedContent);
	}

	const kickedMemberIndex = kickedList.findIndex(id => id == member.id);

	if (kickedMemberIndex != -1) {
		kickedList.splice(kickedMemberIndex, 1);
		lobbyList = lobbyList.filter(l => l.id != member.id);

		fs.writeFile(`${folderRoot}/kicked.json`, JSON.stringify(kickedList), 'utf8', (err) => {
			if (err) {
				log.error('Failed to write kicked state', { file: 'kicked.json' }, err);
			}
		});

		fs.writeFile(`${folderRoot}/lobby.json`, JSON.stringify(lobbyList), 'utf8', (err) => {
			if (err) {
				log.error('Failed to write lobby state', { file: 'lobby.json' }, err);
			}
		});
	}
	else {
		const adminOnlyChannel = getChannel('adminOnly'),
			embed = new RichEmbed()
				.setTitle('A member left!')
				.setColor(0x1abc9c)
				.setDescription(`${member} Left the server!`);

		adminOnlyChannel.send(embed)
			.catch(err => log.error('Failed to post leave notice', { memberId: member.id, channel: 'adminOnly' }, err));
	}
});

discordClient.on('messageReactionAdd', async (reaction, reactionUser) => {
	if (!reaction || !reactionUser || reactionUser.bot) {
		return;
	}

	const reactionMember = guild.member(reactionUser);

	if (!reactionMember) {
		return;
	}

	const unfinishedPollIndex = unfinishedPollList.findIndex(p => p.memberId == reactionMember.id && p.setupData && p.setupData.messageId == reaction.message.id),
		openPollIndex = (unfinishedPollIndex != -1 ? -1 : openPollList.findIndex(p => p.messageId == reaction.message.id)),
		lobbyListIndex = (unfinishedPollIndex != -1 || openPollIndex != -1 ? -1 : lobbyList.findIndex(l => l.message_id == reaction.message.id));

	if (unfinishedPollIndex != -1 && unfinishedPollList[unfinishedPollIndex]) {
		const unfinishedPoll = unfinishedPollList[unfinishedPollIndex];

		Object.setPrototypeOf(unfinishedPoll, Poll.prototype);

		const option = (unfinishedPoll.setupData && unfinishedPoll.setupData.messageId == reaction.message.id && unfinishedPoll.options.length > 0 ? unfinishedPoll.options[unfinishedPoll.options.length - 1] : null),
			embed = new RichEmbed()
				.setColor(0x1abc9c)
				.setTitle('New Poll Set Up');

		if (option && option.emoji == null) {
			if (!reaction.emoji.id || discordClient.emojis.get(reaction.emoji.id)) {
				option.emoji = new OptionEmoji(reaction.emoji.name, reaction.emoji.id);
				unfinishedPoll.options[unfinishedPoll.options.length - 1] = option;


				embed.setDescription(unfinishedPoll.getDescriptionForEmbed() + '**Next: Type out another voting option for your poll.**\n\nNote: Type [done] if you are finished adding options.');

				unfinishedPollList[unfinishedPollIndex] = unfinishedPoll;

				fs.writeFile(`${folderRoot}/unfinished polls.json`, JSON.stringify(unfinishedPollList), 'utf8', (err) => {
					if (err) {
						log.error('Failed to write unfinished polls', { file: 'unfinished polls.json' }, err);
					}
					else {
						reaction.message.edit(embed);
					}
				});
			}
			else {
				embed.setColor(0xe91e63)
					.setDescription(unfinishedPoll.getDescriptionForEmbed() + '**ERROR: You must react to this message with a default emoji or a custom emoji from this server!\n\n**Next: React with an emoji for this option.**\n\nNote: The emoji must be a default emoji or a custom emoji from this server.');

				reaction.message.edit(embed);
			}
		}
	}
	else if (openPollIndex != -1 && openPollList[openPollIndex]) {
		if (openPollList[openPollIndex].optionsAreMutuallyExclusive) {
			openPollList[openPollIndex].options.filter(o => o.emoji.name != reaction.emoji.name && o.emoji.id != reaction.emoji.id).forEach((option) => {
				option.memberIds = option.memberIds.filter(i => i != reactionMember.id)

				const otherReaction = reaction.message.reactions.find(r => r.emoji.name == option.emoji.name && r.emoji.id == option.emoji.id);

				if (otherReaction) {
					otherReaction.remove(reactionUser);
				}
			})
		}

		const optionListIndex = openPollList[openPollIndex].options.findIndex(o => o.emoji.name == reaction.emoji.name && o.emoji.id == reaction.emoji.id);

		if (optionListIndex != -1) {
			const option = openPollList[openPollIndex].options[optionListIndex];

			if (!option.memberIds.includes(reactionMember.id)) {
				option.memberIds.push(reactionMember.id);

				fs.writeFile(`${folderRoot}/open polls.json`, JSON.stringify(openPollList), 'utf8', (err) => {
					if (err) {
						log.error('Failed to write open polls', { file: 'open polls.json' }, err);
					}
				});
			}
		}
	}
	else if (lobbyListIndex != -1 && lobbyList[lobbyListIndex]) {
		const loiterer = lobbyList[lobbyListIndex],
			loitererMember = guild.members.find(m => m.id == loiterer.id);

		if (!loitererMember) {
			return;
		}

		if (reaction.emoji.name == "👎") {
			log.info('Lobby rejection logged', { memberId: loiterer.id, displayName: loitererMember.displayName });
		}
		else {
			log.info('Member admitted by reaction', { memberId: loiterer.id, displayName: loitererMember.displayName });
			admitMember(loitererMember);
		}
	}
});

discordClient.on('messageReactionRemove', async (reaction, reactionUser) => {
	if (!reaction || !reactionUser || reactionUser.bot) {
		return;
	}

	const reactionMember = guild.member(reactionUser);

	if (!reactionMember) {
		return;
	}

	const openPollIndex = openPollList.findIndex(p => p.messageId == reaction.message.id);

	if (openPollIndex != -1 && openPollList[openPollIndex]) {
		const optionListIndex = openPollList[openPollIndex].options.findIndex(o => o.emoji.name == reaction.emoji.name && o.emoji.id == reaction.emoji.id);

		if (optionListIndex != -1) {
			const option = openPollList[openPollIndex].options[optionListIndex];

			option.memberIds = option.memberIds.filter(i => i != reactionMember.id);

			fs.writeFile(`${folderRoot}/open polls.json`, JSON.stringify(openPollList), 'utf8', (err) => {
				if (err) {
					log.error('Failed to write open polls', { file: 'open polls.json' }, err);
				}
			});
		}
	}
});

discordClient.on('raw', packet => {
	if (!['MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE'].includes(packet.t)) return;

	const channel = discordClient.channels.get(packet.d.channel_id);

	if (!channel || channel.messages.has(packet.d.message_id)) return;

	channel.fetchMessage(packet.d.message_id).then(message => {
		// Emojis can have identifiers of name:id format, so we have to account for that case as well
		const emoji = packet.d.emoji.id ? `${packet.d.emoji.name}:${packet.d.emoji.id}` : packet.d.emoji.name;

		// This gives us the reaction we need to emit the event properly, in top of the message object
		const reaction = message.reactions.get(emoji);

		if (!reaction) return;

		// Adds the currently reacting user to the reaction's users collection.
		reaction.users.set(packet.d.user_id, discordClient.users.get(packet.d.user_id));

		// Check which type of event it is before emitting
		if (packet.t === 'MESSAGE_REACTION_ADD') {
			discordClient.emit('messageReactionAdd', reaction, discordClient.users.get(packet.d.user_id));
		}

		if (packet.t === 'MESSAGE_REACTION_REMOVE') {
			discordClient.emit('messageReactionRemove', reaction, discordClient.users.get(packet.d.user_id));
		}
	}).catch(err => log.error('Failed to process raw gateway event', { event: packet.t }, err));
});
