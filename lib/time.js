const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatTime(date) {
	let hours = (date.getHours() % 12),
		minutes = date.getMinutes();

	const timeSuffix = date.getHours() > 11 ? 'PM' : 'AM';

	if (hours === 0) hours = 12;

	if (hours < 10) {
		hours = '0' + hours;
	}

	if (minutes < 10) {
		minutes = '0' + minutes;
	}

	return hours + ':' + minutes + ' ' + timeSuffix;
}

function formatDateTime(startDateTime, endDateTime = null) {
	const startDate = new Date(Date.parse(startDateTime)),
		endDate = (endDateTime ? new Date(Date.parse(endDateTime)) : null),
		month = MONTH_NAMES[startDate.getMonth()],
		day = startDate.getDate(),
		year = startDate.getFullYear(),
		startTime = formatTime(startDate),
		endTime = (endDate ? formatTime(endDate) : null);

	return month + ' ' + day + ', ' + year + ' (' + startTime + (endTime ? ' to ' + endTime : '') + ')';
}

function formatDateForRSVP(date) {
	const month = MONTH_NAMES[date.getMonth()],
		day = date.getDate(),
		year = date.getFullYear();

	return month + ' ' + day + ', ' + year + ' (' + formatTime(date) + ')';
}

module.exports = {
	formatTime: formatTime,
	formatDateTime: formatDateTime,
	formatDateForRSVP: formatDateForRSVP
};
