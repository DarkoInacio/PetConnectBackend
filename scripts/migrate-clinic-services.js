'use strict';

/**
 * Agenda personal: asigna ClinicService por defecto y clinicServiceId en slots, omits y citas.
 * Crea índices nuevos (y elimina el unique antiguo de availabilityslots si existía).
 *
 * Uso: node scripts/migrate-clinic-services.js
 * Requiere MONGODB_URI en .env
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const User = require('../src/models/User');
const ClinicService = require('../src/models/ClinicService');
const AvailabilitySlot = require('../src/models/AvailabilitySlot');
const AgendaSlotOmit = require('../src/models/AgendaSlotOmit');
const Appointment = require('../src/models/Appointment');

async function main() {
	const uri = process.env.MONGODB_URI;
	if (!uri) {
		console.error('Defina MONGODB_URI');
		process.exit(1);
	}
	await mongoose.connect(uri);
	const db = mongoose.connection.db;

	const vets = await User.find({ role: 'proveedor', providerType: 'veterinaria' })
		.select('_id')
		.lean();

	const defaultIdByProvider = new Map();
	for (const v of vets) {
		const pid = v._id;
		let doc = await ClinicService.findOne({ providerId: pid, active: true }).sort({ createdAt: 1 });
		if (!doc) {
			doc = await ClinicService.create({
				providerId: pid,
				displayName: 'Consulta general',
				kind: 'consulta',
				slotDurationMinutes: 30,
				active: true
			});
			console.log('Creada línea default para', String(pid));
		}
		defaultIdByProvider.set(String(pid), doc._id);
	}

	for (const [pstr, sid] of defaultIdByProvider) {
		const r1 = await AvailabilitySlot.updateMany(
			{ providerId: new mongoose.Types.ObjectId(pstr), $or: [{ clinicServiceId: { $exists: false } }, { clinicServiceId: null }] },
			{ $set: { clinicServiceId: sid } }
		);
		if (r1.modifiedCount) console.log('Slots actualizados', pstr, r1.modifiedCount);
	}

	for (const [pstr, sid] of defaultIdByProvider) {
		const r2 = await AgendaSlotOmit.updateMany(
			{
				providerId: new mongoose.Types.ObjectId(pstr),
				$or: [{ clinicServiceId: { $exists: false } }, { clinicServiceId: null }]
			},
			{ $set: { clinicServiceId: sid } }
		);
		if (r2.modifiedCount) console.log('Omits actualizados', pstr, r2.modifiedCount);
	}

	for (const [pstr, sid] of defaultIdByProvider) {
		const r3 = await Appointment.updateMany(
			{
				providerId: new mongoose.Types.ObjectId(pstr),
				bookingSource: 'availability_slot',
				$or: [{ clinicServiceId: { $exists: false } }, { clinicServiceId: null }]
			},
			{ $set: { clinicServiceId: sid } }
		);
		if (r3.modifiedCount) console.log('Appointments actualizados', pstr, r3.modifiedCount);
	}

	/** Índices: quitar el unique viejo (providerId + startAt) si sigue en la colección. */
	const slotColl = db.collection('availabilityslots');
	try {
		const ix = await slotColl.indexes();
		const hasOld = ix.some((i) => i.name === 'providerId_1_startAt_1' || (i.key && i.key.startAt && i.key.providerId && !i.key.clinicServiceId));
		if (hasOld) {
			await slotColl.dropIndex('providerId_1_startAt_1').catch(() => {});
		}
	} catch (e) {
		console.warn('Aviso índice slots:', e.message);
	}

	const omitColl = db.collection('agendaslotomits');
	try {
		await omitColl.dropIndex('providerId_1_startAtMs_1').catch(() => {});
	} catch (e) {
		console.warn('Aviso índice omits:', e.message);
	}

	await AvailabilitySlot.syncIndexes();
	await AgendaSlotOmit.syncIndexes();

	console.log('Migración clinic-services finalizada. Clínicas:', defaultIdByProvider.size);
	await mongoose.disconnect();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
