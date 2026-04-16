'use strict';

/**
 * Crea documentos Appointment (bookingSource legacy_cita) para Cita que aún no tienen par HU-14.
 * Uso: MONGODB_URI=... node scripts/migrate-citas-to-appointments.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Cita = require('../src/models/Cita');
const Appointment = require('../src/models/Appointment');

function mapCitaEstadoToAppointmentStatus(estado) {
	switch (estado) {
		case 'pendiente':
			return 'pending_confirmation';
		case 'confirmada':
			return 'confirmed';
		case 'cancelada':
			return 'cancelled_by_owner';
		case 'completada':
			return 'completed';
		default:
			return 'pending_confirmation';
	}
}

async function main() {
	const uri = process.env.MONGODB_URI;
	if (!uri) {
		console.error('Defina MONGODB_URI');
		process.exit(1);
	}
	await mongoose.connect(uri);
	const citas = await Cita.find({}).lean();
	let created = 0;
	let skipped = 0;
	for (const c of citas) {
		const exists = await Appointment.findOne({ legacyCitaId: c._id }).select('_id').lean();
		if (exists) {
			skipped++;
			continue;
		}
		await Appointment.create({
			ownerId: c.dueno,
			providerId: c.proveedor,
			bookingSource: 'legacy_cita',
			legacyCitaId: c._id,
			startAt: c.fecha,
			endAt: new Date(new Date(c.fecha).getTime() + 60 * 60 * 1000),
			pet: {
				name: c.mascota?.nombre || '',
				species: c.mascota?.especie || ''
			},
			reason: c.servicio || 'Cita',
			status: mapCitaEstadoToAppointmentStatus(c.estado)
		});
		created++;
	}
	console.log(`Listo. Creadas: ${created}, ya existían: ${skipped}, total citas: ${citas.length}`);
	await mongoose.disconnect();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
