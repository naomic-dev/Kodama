require('dotenv').config();
require('./config');
const { Client } = require('discord.js');
const log = require('./logger');
const store = require('./store/jsonStore');
const { onReady } = require('./events/ready');
const { onMessage } = require('./events/message');
const { onGuildMemberAdd, onGuildMemberRemove } = require('./events/members');
const { onMessageReactionAdd, onMessageReactionRemove, onRaw } = require('./events/reactions');

const discordClient = new Client();

log.info('Starting Kodama', {
	dev: process.env.DEV === 'true',
	dataDirectory: store.folderRoot
});

discordClient.on('error', err => log.error('Discord client error', err));
discordClient.on('ready', () => onReady(discordClient).catch(err => log.error('Ready handler failed', err)));
discordClient.on('message', msg => onMessage(discordClient, msg));
discordClient.on('guildMemberAdd', member => onGuildMemberAdd(member));
discordClient.on('guildMemberRemove', member => onGuildMemberRemove(member));
discordClient.on('messageReactionAdd', (reaction, user) => onMessageReactionAdd(discordClient, reaction, user).catch(err => log.error('Reaction handler failed', err)));
discordClient.on('messageReactionRemove', (reaction, user) => onMessageReactionRemove(reaction, user).catch(err => log.error('Reaction removal handler failed', err)));
discordClient.on('raw', packet => onRaw(discordClient, packet));

discordClient.login(process.env.BOT_TOKEN);
