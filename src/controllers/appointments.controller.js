'use strict';

const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const AvailabilitySlot = require('../models/AvailabilitySlot');
const User = require('../models/User');

const MIN_HOURS_BEFORE_CANCEL = 2;

async function listAvailableSlotsByProvider(req, res, next) {
	try {
		const { providerId } = req.params;
		const { date } = req.query;

		if (!mongoose.Types.ObjectId.isValid(providerId)) {
			return res.status(400).json({ message: 'providerId invalido' });
		}

		const provider = await User.findById(providerId).select('_id role status');
		if (!provider || provider.role !== 'proveedor') {
			return res.status(404).json({ message: 'Proveedor no encontrado' });
		}
		if (provider.status !== 'aprobado') {
			return res.status(400).json({ message: 'El proveedor no esta disponible para citas' });
		}

		const query = {
			providerId,
			status: 'available',
			startAt: { $gte: new Date() }
		};

		if (date) {
			const dateRe = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRe.test(date)) {
				return res.status(400).json({ message: 'date invalida. Usar formato YYYY-MM-DD' });
			}
			const [year, month, day] = date.split('-').map(Number);
			const from = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
			const to = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
			query.startAt = { $gte: from, $lte: to };
		}

		const slots = await AvailabilitySlot.find(query).sort({ startAt: 1 });
		return res.status(200).json({ slots });
	} catch (error) {
		next(error);
	}
}

async function createAppointment(req, res, next) {
	try {
		const { providerId, slotId, reason } = req.body;
		if (!providerId || !slotId) {
			return res.status(400).json({ message: 'Campos obligatorios: providerId, slotId' });
		}
		if (!mongoose.Types.ObjectId.isValid(providerId) || !mongoose.Types.ObjectId.isValid(slotId)) {
			return res.status(400).json({ message: 'providerId o slotId invalido' });
		}

		const provider = await User.findById(providerId).select('_id role status');
		if (!provider || provider.role !== 'proveedor') {
			return res.status(404).json({ message: 'Proveedor no encontrado' });
		}
		if (provider.status !== 'aprobado') {
			return res.status(400).json({ message: 'El proveedor no esta disponible para citas' });
		}

		// Operacion atomica para consumir el bloque y evitar doble reserva.
		const consumedSlot = await AvailabilitySlot.findOneAndDelete({
			_id: slotId,
			providerId,
			status: 'available',
			startAt: { $gte: new Date() }
		});

		if (!consumedSlot) {
			return res.status(409).json({ message: 'El bloque ya no esta disponible' });
		}

		try {
			const appointment = await Appointment.create({
				ownerId: req.user.id,
				providerId,
				slotId,
				startAt: consumedSlot.startAt,
				endAt: consumedSlot.endAt,
				reason: reason || undefined,
				status: 'confirmed'
			});

			return res.status(201).json({
				message: 'Cita agendada correctamente',
				appointment
			});
		} catch (createError) {
			// Compensacion: restaurar el bloque si la cita no pudo crearse.
			await AvailabilitySlot.create({
				providerId: consumedSlot.providerId,
				startAt: consumedSlot.startAt,
				endAt: consumedSlot.endAt,
				status: consumedSlot.status
			});
			throw createError;
		}
	} catch (error) {
		next(error);
	}
}

async function listMyAppointments(req, res, next) {
	try {
		const appointments = await Appointment.find({ ownerId: req.user.id })
			.sort({ startAt: -1 })
			.populate('providerId', 'name lastName email providerType');

		return res.status(200).json({ appointments });
	} catch (error) {
		next(error);
	}
}

async function cancelMyAppointment(req, res, next) {
	try {
		const appointment = await Appointment.findOne({
			_id: req.params.id,
			ownerId: req.user.id
		});
		if (!appointment) {
			return res.status(404).json({ message: 'Cita no encontrada' });
		}
		if (appointment.status !== 'confirmed') {
			return res.status(400).json({ message: 'Solo se pueden cancelar citas confirmadas' });
		}

		const msBeforeStart = appointment.startAt.getTime() - Date.now();
		const minMsRequired = MIN_HOURS_BEFORE_CANCEL * 60 * 60 * 1000;
		if (msBeforeStart < minMsRequired) {
			return res.status(400).json({
				message: `Solo puedes cancelar con al menos ${MIN_HOURS_BEFORE_CANCEL} horas de anticipacion`
			});
		}

		appointment.status = 'cancelled_by_owner';
		appointment.cancelledAt = new Date();
		appointment.cancellationReason = req.body.cancellationReason || undefined;
		await appointment.save();

		return res.status(200).json({ message: 'Cita cancelada correctamente', appointment });
	} catch (error) {
		next(error);
	}
}

module.exports = {
	listAvailableSlotsByProvider,
	createAppointment,
	listMyAppointments,
	cancelMyAppointment
};
