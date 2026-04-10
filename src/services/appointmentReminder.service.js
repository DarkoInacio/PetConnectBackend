'use strict';

const Appointment = require('../models/Appointment');
const { sendEmail } = require('../utils/email');

const WINDOW_MINUTES = Number(process.env.REMINDER_WINDOW_MINUTES || 5);

function buildWindow() {
	const now = new Date();
	const target = new Date(now.getTime() + 24 * 60 * 60 * 1000);
	const from = new Date(target.getTime() - WINDOW_MINUTES * 60 * 1000);
	const to = new Date(target.getTime() + WINDOW_MINUTES * 60 * 1000);
	return { from, to };
}

function buildReminderHtml({ ownerName, providerName, startAt }) {
	return `
		<p>Hola ${ownerName},</p>
		<p>Te recordamos que tienes una cita en 24 horas.</p>
		<p><strong>Proveedor:</strong> ${providerName}</p>
		<p><strong>Fecha y hora:</strong> ${startAt.toISOString()}</p>
		<p>Gracias por usar PetConnect.</p>
	`;
}

async function run24hAppointmentReminders() {
	const { from, to } = buildWindow();

	const appointments = await Appointment.find({
		status: 'confirmed',
		reminder24hSentAt: null,
		startAt: { $gte: from, $lte: to }
	})
		.populate('ownerId', 'name email')
		.populate('providerId', 'name lastName');

	let processed = 0;
	let sent = 0;
	let skipped = 0;
	let failed = 0;

	for (const appointment of appointments) {
		processed += 1;

		const owner = appointment.ownerId;
		const provider = appointment.providerId;
		if (!owner || !owner.email) {
			skipped += 1;
			continue;
		}

		const ownerName = owner.name || 'usuario';
		const providerName = provider ? `${provider.name || ''} ${provider.lastName || ''}`.trim() : 'Proveedor';

		try {
			await sendEmail({
				to: owner.email,
				subject: 'Recordatorio: cita en 24 horas',
				html: buildReminderHtml({
					ownerName,
					providerName,
					startAt: appointment.startAt
				})
			});

			const updated = await Appointment.findOneAndUpdate(
				{ _id: appointment._id, reminder24hSentAt: null },
				{ $set: { reminder24hSentAt: new Date() } },
				{ new: true }
			);
			if (updated) {
				sent += 1;
			} else {
				skipped += 1;
			}
		} catch (error) {
			failed += 1;
			console.error(`Error enviando recordatorio para cita ${appointment._id}:`, error.message);
		}
	}

	return { window: { from, to }, processed, sent, skipped, failed };
}

module.exports = { run24hAppointmentReminders };
