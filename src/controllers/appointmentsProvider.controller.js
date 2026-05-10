'use strict';

const Appointment = require('../models/Appointment');
const AvailabilitySlot = require('../models/AvailabilitySlot');

const CANCELLABLE_BY_PROVIDER_STATUSES = ['pending_confirmation', 'confirmed'];
const COMPLETABLE_STATUSES = ['pending_confirmation', 'confirmed'];

async function restoreSlotForAppointmentDoc(appointment) {
	const provId =
		appointment.providerId &&
		typeof appointment.providerId === 'object' &&
		appointment.providerId._id
			? appointment.providerId._id
			: appointment.providerId;

	await AvailabilitySlot.updateOne(
		{
			providerId: provId,
			startAt: appointment.startAt
		},
		{
			$setOnInsert: {
				providerId: provId,
				startAt: appointment.startAt,
				endAt: appointment.endAt,
				status: 'available'
			}
		},
		{ upsert: true }
	);
}

async function confirmAppointmentAsProvider(req, res, next) {
	try {
		const appointment = await Appointment.findOne({
			_id: req.params.id,
			providerId: req.user.id
		});
		if (!appointment) {
			return res.status(404).json({ message: 'Cita no encontrada' });
		}
		if (appointment.status !== 'pending_confirmation') {
			return res.status(400).json({ message: 'Solo se puede confirmar una cita pendiente de confirmación' });
		}

		appointment.status = 'confirmed';
		await appointment.save();

		return res.status(200).json({ message: 'Cita confirmada', appointment });
	} catch (error) {
		next(error);
	}
}

async function cancelAppointmentAsProvider(req, res, next) {
	try {
		const cancellationReason =
			req.body?.cancellationReason == null ? '' : String(req.body.cancellationReason).trim();
		if (!cancellationReason) {
			return res.status(400).json({ message: 'cancellationReason es obligatorio' });
		}
		if (cancellationReason.length > 200) {
			return res.status(400).json({ message: 'cancellationReason no puede superar 200 caracteres' });
		}

		const appointment = await Appointment.findOne({
			_id: req.params.id,
			providerId: req.user.id
		});
		if (!appointment) {
			return res.status(404).json({ message: 'Cita no encontrada' });
		}
		if (!CANCELLABLE_BY_PROVIDER_STATUSES.includes(appointment.status)) {
			return res.status(400).json({ message: 'No se puede cancelar esta cita en su estado actual' });
		}

		appointment.status = 'cancelled_by_provider';
		appointment.cancelledAt = new Date();
		appointment.cancellationReason = cancellationReason;
		await appointment.save();

		await restoreSlotForAppointmentDoc(appointment);

		return res.status(200).json({ message: 'Cita cancelada por el proveedor', appointment });
	} catch (error) {
		next(error);
	}
}

async function completeVetClinicAppointmentAsProvider(req, res, next) {
	try {
		const appointment = await Appointment.findOne({
			_id: req.params.id,
			providerId: req.user.id
		});
		if (!appointment) {
			return res.status(404).json({ message: 'Cita no encontrada' });
		}

		if (!COMPLETABLE_STATUSES.includes(appointment.status)) {
			return res.status(400).json({ message: 'No se puede completar esta cita en su estado actual' });
		}

		appointment.status = 'completed';
		await appointment.save();

		return res.status(200).json({ message: 'Cita marcada como completada', appointment });
	} catch (error) {
		next(error);
	}
}

async function completeWalkerAppointmentAsProvider(req, res, next) {
	try {
		return res.status(400).json({
			message:
				'Las solicitudes de paseo o cuidado aún no se integran a este endpoint. Use la gestión de citas cuando esté disponible.'
		});
	} catch (error) {
		next(error);
	}
}

async function patchAppointmentInternalNotes(req, res, next) {
	try {
		const raw = req.body?.internalNotes;
		if (raw === undefined || raw === null) {
			return res.status(400).json({ message: 'internalNotes es obligatorio' });
		}
		const internalNotes = String(raw).trim();
		if (internalNotes.length > 2000) {
			return res.status(400).json({ message: 'Las notas internas no pueden superar 2000 caracteres' });
		}

		const appointment = await Appointment.findOne({
			_id: req.params.id,
			providerId: req.user.id
		});
		if (!appointment) {
			return res.status(404).json({ message: 'Cita no encontrada' });
		}

		appointment.internalNotes = internalNotes;
		await appointment.save();

		return res.status(200).json({ message: 'Notas guardadas', internalNotes });
	} catch (error) {
		next(error);
	}
}

module.exports = {
	confirmAppointmentAsProvider,
	cancelAppointmentAsProvider,
	completeVetClinicAppointmentAsProvider,
	completeWalkerAppointmentAsProvider,
	patchAppointmentInternalNotes
};
