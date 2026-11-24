const schedule = require('node-schedule');
const { RichEmbed } = require('discord.js');
const log = require('../logger');
const store = require('../store/jsonStore');
const state = require('../store/state');
const { Poll } = require('../models/poll');

function closePoll(poll) {
	Object.setPrototypeOf(poll, Poll.prototype);

	const channel = state.guild.channels.find(ch => ch.id == poll.channelId),
		embed = new RichEmbed()
			.setTitle(`Poll '${poll.title}' has closed!`)
			.setColor(0x1abc9c)
			.setDescription(poll.getDescriptionForEmbed(state.guild, 'closed'));

	if (channel) {
		channel.send(embed)
			.catch(err => log.error('Failed to post poll results', { pollId: poll.id, channelId: poll.channelId }, err));
	}

	state.openPollList = state.openPollList.filter(p => p.id != poll.id);

	store.saveSync('openPolls', state.openPollList);
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
	state.openPollList.slice().forEach(poll => schedulePollClosure(poll));
}

module.exports = {
	closePoll: closePoll,
	schedulePollClosure: schedulePollClosure,
	schedulePollClosures: schedulePollClosures
};
