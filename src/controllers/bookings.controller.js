'use strict';

const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');

function serializeOwnerAppointment(a) {
	const prov = a.providerId;
	const provider =
		prov && typeof prov === 'object' && prov.name !== undefined
			? {
					_id: prov._id,
					name: prov.name,
					lastName: prov.lastName,
					email: prov.email,
					providerType: prov.providerType
				}
			: null;

	return {
		kind: 'appointment',
		id: String(a._id),
		bookingSource: 'availability_slot',
		startAt: a.startAt,
		endAt: a.endAt,
		status: a.status,
		provider,
		pet: a.pet,
		petId: a.petId ? String(a.petId) : undefined,
		reason: a.reason || '',
		clinicService: null
	};
}

function serializeProviderAppointment(a) {
	const own = a.ownerId;
	const owner =
		own && typeof own === 'object' && own.name !== undefined
			? {
					_id: own._id,
					name: own.name,
					lastName: own.lastName,
					email: own.email,
					phone: own.phone || undefined
				}
			: null;

	return {
		kind: 'appointment',
		id: String(a._id),
		bookingSource: 'availability_slot',
		startAt: a.startAt,
		endAt: a.endAt,
		status: a.status,
		owner,
		pet: a.pet,
		petId: a.petId ? String(a.petId) : undefined,
		reason: a.reason || '',
		clinicService: null,
		internalNotes: typeof a.internalNotes === 'string' ? a.internalNotes : ''
	};
}

async function listMyBookings(req, res, next) {
	try {
		const appointments = await Appointment.find({ ownerId: req.user.id })
			.sort({ startAt: -1 })
			.populate('providerId', 'name lastName email providerType')
			.lean();

		const items = appointments.map(serializeOwnerAppointment);

		let note = null;
		if (process.env.NODE_ENV !== 'production') {
			note =
				items.length === 0
					? 'No hay ítems de agendamiento en servidor; las reservas por franja aparecen aquí.'
					: null;
		}

		return res.status(200).json({ items, ...(note ? { note } : {}) });
	} catch (error) {
		next(error);
	}
}

async function listProviderBookings(req, res, next) {
	try {
		if (!mongoose.isValidObjectId(req.user.id)) {
			return res.status(401).json({ message: 'Usuario inválido' });
		}

		const providerObjectId = new mongoose.Types.ObjectId(req.user.id);

		const appointments = await Appointment.find({ providerId: providerObjectId })
			.sort({ startAt: -1 })
			.populate('ownerId', 'name lastName email phone')
			.lean();

		const items = appointments.map(serializeProviderAppointment);

		return res.status(200).json({ items });
	} catch (error) {
		next(error);
	}
}

module.exports = {
	listMyBookings,
	listProviderBookings
};
