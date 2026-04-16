'use strict';

const cron = require('node-cron');
const Cita = require('../models/Cita');

function startOfLocalDay(d = new Date()) {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	return x;
}

function startOwnerAppointmentsCronJobs() {
	// Cada día a medianoche (zona horaria del servidor)
	cron.schedule('0 0 * * *', async () => {
		try {
			const start = startOfLocalDay();
			const result = await Cita.updateMany(
				{ estado: 'confirmada', fecha: { $lt: start } },
				{ $set: { estado: 'completada' } }
			);
			console.log(
				`[cron citas] Citas confirmadas con fecha anterior a ${start.toISOString()}: ${result.modifiedCount} marcadas como completadas.`
			);
		} catch (err) {
			console.error('[cron citas]', err);
		}
	});
}

module.exports = { startOwnerAppointmentsCronJobs };
