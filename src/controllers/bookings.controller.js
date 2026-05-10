'use strict';

const Appointment = require('../models/Appointment');

function normalizeAppointment(a) {
	return {
		kind: 'appointment',
		id: a._id,
		bookingSource: a.bookingSource || 'availability_slot',
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

/**
 * GET /api/bookings/mine — reservas del dueño (modelo Appointment)
 */
async function listUnifiedMine(req, res, next) {
	try {
		const ownerId = req.user.id;
		const appointments = await Appointment.find({ ownerId })
			.sort({ startAt: -1 })
			.populate('providerId', 'name lastName email providerType')
			.lean();
		const items = appointments.map((a) => ({
			...normalizeAppointment(a),
			provider: a.providerId
		}));
		return res.status(200).json({ canonical: 'Appointment', total: items.length, items });
	} catch (err) {
		next(err);
	}
}

/**
 * GET /api/bookings/provider/mine — reservas donde el usuario es proveedor
 */
async function listUnifiedProviderMine(req, res, next) {
	try {
		const providerId = req.user.id;
		const appointments = await Appointment.find({ providerId })
			.sort({ startAt: -1 })
			.populate('ownerId', 'name lastName email')
			.populate('clinicServiceId', 'displayName')
			.lean();
		const items = appointments.map((a) => {
			const rawCs = a.clinicServiceId;
			const line =
				rawCs && typeof rawCs === 'object' && (rawCs.displayName != null || rawCs._id)
					? {
							id: rawCs._id,
							displayName:
								rawCs.displayName != null && String(rawCs.displayName).trim() !== ''
									? rawCs.displayName
									: 'Línea'
						}
					: null;
			return {
				...normalizeAppointment(a),
				owner: a.ownerId,
				clinicService: line
			};
		});
		return res.status(200).json({ total: items.length, items });
	} catch (err) {
		next(err);
	}
}

module.exports = { listUnifiedMine, listUnifiedProviderMine };
