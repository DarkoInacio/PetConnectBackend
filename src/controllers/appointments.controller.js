'use strict';

const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const Appointment = require('../models/Appointment');
const AvailabilitySlot = require('../models/AvailabilitySlot');
const User = require('../models/User');
const Pet = require('../models/Pet');
const { notifyProveedorAppointmentCancelada } = require('../utils/notifyAppointmentProveedor');
const { getAgendaZone } = require('../utils/vetAgendaSlots');
const ClinicService = require('../models/ClinicService');
const { ensureDefaultClinicService } = require('../utils/clinicService.util');
const { runVetAgendaGenerateForProvider } = require('../services/vetAgendaGenerateCore.service');

const MIN_HOURS_BEFORE_CANCEL = 2;
const CANCELLABLE_STATUSES = ['pending_confirmation', 'confirmed'];
const CREATABLE_STATUSES = ['pending_confirmation', 'confirmed'];

function parsePet(rawPet) {
	if (rawPet === undefined || rawPet === null) return undefined;
	if (typeof rawPet !== 'object') {
		return { error: 'pet debe ser un objeto con name y species' };
	}

	const name = rawPet.name == null ? '' : String(rawPet.name).trim();
	const species = rawPet.species == null ? '' : String(rawPet.species).trim();
	if (!name || !species) {
		return { error: 'pet debe incluir name y species' };
	}

	return { value: { name, species } };
}

function resolveInitialAppointmentStatus(rawStatus) {
	if (rawStatus === undefined || rawStatus === null || String(rawStatus).trim() === '') {
		// Por defecto la cita queda pendiente de confirmacion para alinear el flujo HU-14.
		return { value: 'pending_confirmation' };
	}

	const status = String(rawStatus).trim();
	if (!CREATABLE_STATUSES.includes(status)) {
		return {
			error: `status invalido. Valores permitidos: ${CREATABLE_STATUSES.join(', ')}`
		};
	}
	return { value: status };
}

async function listAvailableSlotsByProvider(req, res, next) {
	try {
		const { providerId } = req.params;
		const { date, clinicServiceId: clinicServiceIdQuery } = req.query;

		if (!mongoose.Types.ObjectId.isValid(providerId)) {
			return res.status(400).json({ message: 'providerId invalido' });
		}

		const provider = await User.findById(providerId).select('_id role roles status providerType');
		const provRoles = provider && provider.roles && provider.roles.length > 0 ? provider.roles : [provider?.role];
		if (!provider || !provRoles.includes('proveedor')) {
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

		if (provider.providerType === 'veterinaria') {
			let services = await ClinicService.find({ providerId, active: true }).lean();
			if (services.length === 0) {
				const d = await ensureDefaultClinicService(providerId);
				services = [d.toObject ? d.toObject() : d];
			}
			const rawCsid =
				clinicServiceIdQuery != null && String(clinicServiceIdQuery).trim() !== ''
					? String(clinicServiceIdQuery).trim()
					: null;
			let resolvedServiceId = rawCsid;
			if (services.length > 1) {
				if (!resolvedServiceId || !mongoose.Types.ObjectId.isValid(resolvedServiceId)) {
					return res.status(400).json({
						message: 'Indica qué línea de atención (clinicServiceId) para listar horarios de esta clínica'
					});
				}
				if (!services.some((s) => String(s._id) === String(resolvedServiceId))) {
					return res.status(400).json({ message: 'clinicServiceId no pertenece a este proveedor' });
				}
			} else {
				resolvedServiceId = String(services[0]._id);
			}
			query.clinicServiceId = resolvedServiceId;
		}

		if (date) {
			const dateRe = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRe.test(date)) {
				return res.status(400).json({ message: 'date invalida. Usar formato YYYY-MM-DD' });
			}
			const [year, month, day] = date.split('-').map(Number);
			const zone = getAgendaZone();
			const start = DateTime.fromObject(
				{ year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 },
				{ zone }
			);
			if (!start.isValid) {
				return res.status(400).json({ message: 'date invalida' });
			}
			const end = start.endOf('day');
			const dayStart = start.toJSDate();
			const dayEnd = end.toJSDate();
			const nowJs = new Date();
			/* Día completo en el pasado: sin franjas */
			if (dayEnd < nowJs) {
				return res.status(200).json({ slots: [] });
			}
			/* Mismo calendario que ahora: solo tramos desde este instante */
			const lower = dayStart < nowJs && nowJs <= dayEnd ? nowJs : dayStart;
			if (lower > dayEnd) {
				return res.status(200).json({ slots: [] });
			}
			query.startAt = { $gte: lower, $lte: dayEnd };
		}

		let slots = await AvailabilitySlot.find(query)
			.sort({ startAt: 1 })
			.populate('clinicServiceId', 'displayName kind');

		/* Primer agendado o límite 31 días roto: si no hay tramos para ese día, rellenamos sólo este día. */
		if (date && provider.providerType === 'veterinaria' && slots.length === 0) {
			const materialized = await runVetAgendaGenerateForProvider(providerId, String(date), String(date));
			if (materialized.ok) {
				slots = await AvailabilitySlot.find(query)
					.sort({ startAt: 1 })
					.populate('clinicServiceId', 'displayName kind');
			}
		}

		return res.status(200).json({ slots });
	} catch (error) {
		next(error);
	}
}

async function createAppointment(req, res, next) {
	try {
		const { providerId, slotId, reason, pet, status, petId } = req.body;
		if (!providerId || !slotId || !petId) {
			return res.status(400).json({ message: 'Campos obligatorios: providerId, slotId, petId' });
		}
		if (
			!mongoose.Types.ObjectId.isValid(providerId) ||
			!mongoose.Types.ObjectId.isValid(slotId) ||
			!mongoose.Types.ObjectId.isValid(petId)
		) {
			return res.status(400).json({ message: 'providerId, slotId o petId invalido' });
		}

		const provider = await User.findById(providerId).select('_id role status');
		if (!provider || provider.role !== 'proveedor') {
			return res.status(404).json({ message: 'Proveedor no encontrado' });
		}
		if (provider.status !== 'aprobado') {
			return res.status(400).json({ message: 'El proveedor no esta disponible para citas' });
		}

		const petDoc = await Pet.findOne({ _id: petId, ownerId: req.user.id }).lean();
		if (!petDoc) {
			return res.status(400).json({ message: 'Mascota no encontrada o no pertenece al dueño' });
		}
		if (petDoc.status !== 'active') {
			return res.status(400).json({ message: 'Solo se pueden agendar mascotas activas' });
		}

		const parsedPet = parsePet(pet);
		if (parsedPet && parsedPet.error) {
			return res.status(400).json({ message: parsedPet.error });
		}
		const parsedStatus = resolveInitialAppointmentStatus(status);
		if (parsedStatus.error) {
			return res.status(400).json({ message: parsedStatus.error });
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
			const embeddedPet =
				parsedPet?.value ||
				(petDoc
					? {
							name: petDoc.name,
							species: petDoc.species
						}
					: undefined);
			const apptPayload = {
				ownerId: req.user.id,
				providerId,
				bookingSource: 'availability_slot',
				slotId,
				petId,
				startAt: consumedSlot.startAt,
				endAt: consumedSlot.endAt,
				pet: embeddedPet,
				reason: reason || undefined,
				status: parsedStatus.value
			};
			if (consumedSlot.clinicServiceId) {
				apptPayload.clinicServiceId = consumedSlot.clinicServiceId;
			}
			const appointment = await Appointment.create(apptPayload);

			return res.status(201).json({
				message: 'Cita agendada correctamente',
				appointment
			});
		} catch (createError) {
			// Compensacion: restaurar el bloque si la cita no pudo crearse.
			const restore = {
				providerId: consumedSlot.providerId,
				startAt: consumedSlot.startAt,
				endAt: consumedSlot.endAt,
				status: consumedSlot.status
			};
			if (consumedSlot.clinicServiceId) {
				restore.clinicServiceId = consumedSlot.clinicServiceId;
			}
			await AvailabilitySlot.create(restore);
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
			ownerId: req.user.id
		})
			.populate('providerId', 'name lastName email')
			.populate('ownerId', 'name lastName email');
		if (!appointment) {
			return res.status(404).json({ message: 'Cita no encontrada' });
		}
		if (!CANCELLABLE_STATUSES.includes(appointment.status)) {
			return res
				.status(400)
				.json({ message: 'Solo se pueden cancelar citas pendientes de confirmacion o confirmadas' });
		}

		if (appointment.status === 'confirmed') {
			const msBeforeStart = appointment.startAt.getTime() - Date.now();
			const minMsRequired = MIN_HOURS_BEFORE_CANCEL * 60 * 60 * 1000;
			if (msBeforeStart < minMsRequired) {
				return res.status(400).json({
					message: `Solo puedes cancelar con al menos ${MIN_HOURS_BEFORE_CANCEL} horas de anticipacion`
				});
			}
		}

		appointment.status = 'cancelled_by_owner';
		appointment.cancelledAt = new Date();
		appointment.cancellationReason = cancellationReason;
		await appointment.save();

		const src = appointment.bookingSource || 'availability_slot';
		if (src === 'availability_slot' && appointment.slotId) {
			const provObjectId = appointment.providerId._id || appointment.providerId;
			const csid =
				appointment.clinicServiceId ||
				(await ensureDefaultClinicService(provObjectId))._id;
			await AvailabilitySlot.updateOne(
				{
					providerId: provObjectId,
					clinicServiceId: csid,
					startAt: appointment.startAt
				},
				{
					$setOnInsert: {
						providerId: provObjectId,
						clinicServiceId: csid,
						startAt: appointment.startAt,
						endAt: appointment.endAt,
						status: 'available'
					}
				},
				{ upsert: true }
			);
		}

		notifyProveedorAppointmentCancelada({
			proveedorEmail: appointment.providerId?.email,
			proveedorDoc: appointment.providerId,
			duenoDoc: appointment.ownerId,
			appointment,
			cancellationReason
		}).catch((err) => console.error('notifyProveedorAppointmentCancelada:', err.message));

		return res.status(200).json({ message: 'Cita cancelada correctamente', appointment });
	} catch (error) {
		next(error);
	}
}

async function confirmProviderAppointment(req, res, next) {
	try {
		const id = req.params.id;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({ message: 'Id invalido' });
		}

		const appointment = await Appointment.findOne({
			_id: id,
			providerId: req.user.id
		});
		if (!appointment) {
			return res.status(404).json({ message: 'Reserva no encontrada' });
		}
		if (appointment.status !== 'pending_confirmation') {
			return res.status(400).json({ message: 'Solo se pueden confirmar reservas pendientes de confirmacion' });
		}

		appointment.status = 'confirmed';
		await appointment.save();

		const fresh = await Appointment.findById(appointment._id)
			.populate('ownerId', 'name lastName email')
			.lean();
		return res.status(200).json({ message: 'Reserva confirmada', appointment: fresh });
	} catch (error) {
		next(error);
	}
}

async function cancelProviderAppointment(req, res, next) {
	try {
		const id = req.params.id;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({ message: 'Id invalido' });
		}

		const cancellationReason =
			req.body?.cancellationReason == null ? '' : String(req.body.cancellationReason).trim();
		if (!cancellationReason) {
			return res.status(400).json({ message: 'cancellationReason es obligatorio' });
		}
		if (cancellationReason.length > 200) {
			return res.status(400).json({ message: 'cancellationReason no puede superar 200 caracteres' });
		}

		const appointment = await Appointment.findOne({
			_id: id,
			providerId: req.user.id
		});
		if (!appointment) {
			return res.status(404).json({ message: 'Reserva no encontrada' });
		}
		if (!CANCELLABLE_STATUSES.includes(appointment.status)) {
			return res
				.status(400)
				.json({ message: 'Solo se pueden cancelar reservas pendientes de confirmacion o confirmadas' });
		}

		if (appointment.status === 'confirmed') {
			const msBeforeStart = appointment.startAt.getTime() - Date.now();
			const minMsRequired = MIN_HOURS_BEFORE_CANCEL * 60 * 60 * 1000;
			if (msBeforeStart < minMsRequired) {
				return res.status(400).json({
					message: `Solo puedes cancelar con al menos ${MIN_HOURS_BEFORE_CANCEL} horas de anticipacion`
				});
			}
		}

		appointment.status = 'cancelled_by_provider';
		appointment.cancelledAt = new Date();
		appointment.cancellationReason = cancellationReason;
		await appointment.save();

		const src = appointment.bookingSource || 'availability_slot';
		if (src === 'availability_slot' && appointment.slotId) {
			const provObjectId = appointment.providerId;
			const csid = appointment.clinicServiceId || (await ensureDefaultClinicService(provObjectId))._id;
			await AvailabilitySlot.updateOne(
				{
					providerId: provObjectId,
					clinicServiceId: csid,
					startAt: appointment.startAt
				},
				{
					$setOnInsert: {
						providerId: provObjectId,
						clinicServiceId: csid,
						startAt: appointment.startAt,
						endAt: appointment.endAt,
						status: 'available'
					}
				},
				{ upsert: true }
			);
		}

		const fresh = await Appointment.findById(appointment._id)
			.populate('ownerId', 'name lastName email')
			.lean();
		return res.status(200).json({ message: 'Reserva cancelada', appointment: fresh });
	} catch (error) {
		next(error);
	}
}

/**
 * Marcar como completada reservas de agenda (clínica, availability_slot).
 */
async function completeProviderVetClinicAppointment(req, res, next) {
	try {
		const id = req.params.id;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({ message: 'Id invalido' });
		}

		const appointment = await Appointment.findOne({
			_id: id,
			providerId: req.user.id
		});
		if (!appointment) {
			return res.status(404).json({ message: 'Reserva no encontrada' });
		}
		if (appointment.bookingSource !== 'availability_slot') {
			return res.status(400).json({
				message: 'Marcar completada aquí solo aplica a reservas de agenda (clínica)'
			});
		}
		if (!['pending_confirmation', 'confirmed'].includes(appointment.status)) {
			return res.status(400).json({
				message: 'Solo se puede completar una reserva pendiente o ya confirmada'
			});
		}

		appointment.status = 'completed';
		await appointment.save();

		const fresh = await Appointment.findById(appointment._id)
			.populate('ownerId', 'name lastName email')
			.lean();
		return res.status(200).json({ message: 'Atención marcada como completada', appointment: fresh });
	} catch (error) {
		next(error);
	}
}

/**
 * Marcar como completada solo solicitudes paseador/cuidador (walker_request).
 * Las reservas de clínica usan completeProviderVetClinicAppointment.
 */
async function completeProviderWalkerAppointment(req, res, next) {
	try {
		const id = req.params.id;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({ message: 'Id invalido' });
		}

		const appointment = await Appointment.findOne({
			_id: id,
			providerId: req.user.id
		});
		if (!appointment) {
			return res.status(404).json({ message: 'Reserva no encontrada' });
		}
		if (appointment.bookingSource !== 'walker_request') {
			return res.status(400).json({
				message: 'Marcar completada aquí solo aplica a solicitudes de paseo o cuidado (walker_request)'
			});
		}
		if (!['pending_confirmation', 'confirmed'].includes(appointment.status)) {
			return res.status(400).json({
				message: 'Solo se puede completar una solicitud pendiente o ya confirmada'
			});
		}

		appointment.status = 'completed';
		await appointment.save();

		const fresh = await Appointment.findById(appointment._id)
			.populate('ownerId', 'name lastName email')
			.lean();
		return res.status(200).json({ message: 'Servicio marcado como completado', appointment: fresh });
	} catch (error) {
		next(error);
	}
}

module.exports = {
	listAvailableSlotsByProvider,
	createAppointment,
	listMyAppointments,
	cancelMyAppointment,
	confirmProviderAppointment,
	cancelProviderAppointment,
	completeProviderVetClinicAppointment,
	completeProviderWalkerAppointment
};
