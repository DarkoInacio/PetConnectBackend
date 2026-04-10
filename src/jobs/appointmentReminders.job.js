'use strict';

const cron = require('node-cron');
const { run24hAppointmentReminders } = require('../services/appointmentReminder.service');

let reminderTask = null;

function startAppointmentReminderJob() {
	if (reminderTask) return reminderTask;

	// Cada 5 minutos
	reminderTask = cron.schedule('*/5 * * * *', async () => {
		try {
			const result = await run24hAppointmentReminders();
			if (result.processed > 0) {
				console.log(
					`[reminders24h] processed=${result.processed} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`
				);
			}
		} catch (error) {
			console.error('[reminders24h] Error en job:', error.message);
		}
	});

	console.log('[reminders24h] Job iniciado (cada 5 minutos)');
	return reminderTask;
}

module.exports = { startAppointmentReminderJob };
