'use strict';

const { run24hAppointmentReminders } = require('../services/appointmentReminder.service');

async function runReminders24hNow(req, res, next) {
	try {
		const result = await run24hAppointmentReminders();
		return res.status(200).json({
			message: 'Job de recordatorios 24h ejecutado',
			result
		});
	} catch (error) {
		next(error);
	}
}

module.exports = { runReminders24hNow };
