'use strict';

const Appointment = require('../models/Appointment');
const Cita = require('../models/Cita');

function normalizeAppointment(a) {
	return {
		kind: 'appointment',
		id: a._id,
		bookingSource: a.bookingSource || 'availability_slot',
		legacyCitaId: a.legacyCitaId || null,
		slotId: a.slotId || null,
		petId: a.petId || null,
		startAt: a.startAt,
		endAt: a.endAt,
		status: a.status,
		reason: a.reason || null,
		pet: a.pet || null,
		cancellationReason: a.cancellationReason || null,
		cancelledAt: a.cancelledAt || null,
		providerId: a.providerId,
		createdAt: a.createdAt,
		updatedAt: a.updatedAt
	};
}

function normalizeCita(c) {
	return {
		kind: 'cita_legacy',
		id: c._id,
		bookingSource: null,
		startAt: c.fecha,
		endAt: c.fecha,
		status: c.estado,
		servicio: c.servicio,
		mascota: c.mascota,
		notas: c.notas || null,
		diagnostico: c.diagnostico || null,
		proveedor: c.proveedor,
		dueno: c.dueno,
		createdAt: c.createdAt,
		updatedAt: c.updatedAt
	};
}

/**
 * GET /api/bookings/mine — listado unificado HU-14 (Appointment canónico + Cita huérfanas)
 */
async function listUnifiedMine(req, res, next) {
	try {
		const ownerId = req.user.id;

		const [appointments, citas] = await Promise.all([
			Appointment.find({ ownerId })
				.sort({ startAt: -1 })
				.populate('providerId', 'name lastName email providerType')
				.lean(),
			Cita.find({ dueno: ownerId }).sort({ fecha: -1 }).populate('proveedor', 'name lastName email providerType').lean()
		]);

		const linked = new Set(
			appointments.filter((a) => a.legacyCitaId).map((a) => String(a.legacyCitaId))
		);

		const orphanCitas = citas.filter((c) => !linked.has(String(c._id)));

		const merged = [
			...appointments.map((a) => ({
				...normalizeAppointment(a),
				provider: a.providerId
			})),
			...orphanCitas.map((c) => normalizeCita(c))
		];

		merged.sort((a, b) => {
			const ta = new Date(a.startAt || a.fecha || 0).getTime();
			const tb = new Date(b.startAt || b.fecha || 0).getTime();
			return tb - ta;
		});

		return res.status(200).json({
			canonical: 'Appointment',
			note: 'Las nuevas integraciones deben usar POST /api/appointments (slots). POST /api/citas duplica en Appointment.',
			total: merged.length,
			items: merged
		});
	} catch (err) {
		next(err);
	}
}

/**
 * GET /api/bookings/provider/mine — citas y reservas donde soy proveedor
 */
async function listUnifiedProviderMine(req, res, next) {
	try {
		const providerId = req.user.id;

		const [appointments, citas] = await Promise.all([
			Appointment.find({ providerId })
				.sort({ startAt: -1 })
				.populate('ownerId', 'name lastName email')
				.populate('clinicServiceId', 'displayName')
				.lean(),
			Cita.find({ proveedor: providerId })
				.sort({ fecha: -1 })
				.populate('dueno', 'name lastName email')
				.lean()
		]);

		const linked = new Set(
			appointments.filter((a) => a.legacyCitaId).map((a) => String(a.legacyCitaId))
		);

		const orphanCitas = citas.filter((c) => !linked.has(String(c._id)));

		const merged = [
			...appointments.map((a) => {
				const rawCs = a.clinicServiceId;
				const line =
					rawCs && typeof rawCs === 'object' && (rawCs.displayName != null || rawCs._id)
						? {
								id: rawCs._id,
								displayName: rawCs.displayName != null && String(rawCs.displayName).trim() !== '' ? rawCs.displayName : 'Línea'
							}
						: null;
				return {
					...normalizeAppointment(a),
					owner: a.ownerId,
					clinicService: line
				};
			}),
			...orphanCitas.map((c) => ({ ...normalizeCita(c), clinicService: null }))
		];

		merged.sort((a, b) => {
			const ta = new Date(a.startAt || 0).getTime();
			const tb = new Date(b.startAt || 0).getTime();
			return tb - ta;
		});

		return res.status(200).json({
			total: merged.length,
			items: merged
		});
	} catch (err) {
		next(err);
	}
}

module.exports = { listUnifiedMine, listUnifiedProviderMine };
