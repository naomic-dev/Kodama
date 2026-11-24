const { handlePollSetup } = require('./pollSetup');
const { handleAdminCommand } = require('./admin');
const { handleUtilityCommand } = require('./utility');

module.exports = {
	handlePollSetup: handlePollSetup,
	handleAdminCommand: handleAdminCommand,
	handleUtilityCommand: handleUtilityCommand
};
