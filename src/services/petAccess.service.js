'use strict';

const Appointment = require('../models/Appointment');
const Pet = require('../models/Pet');

const APPOINTMENT_ACCESS_STATUSES = ['confirmed', 'completed'];

async function findPetForOwner(petId, ownerId) {
	if (!petId) return null;
	return Pet.findOne({ _id: petId, ownerId });
}

/**
 * La veterinaria puede ver datos de la mascota si existe cita confirmada o completada con ese pet y ese proveedor.
 */
async function vetHasAccessToPet(providerUserId, petId) {
	const appt = await Appointment.findOne({
		petId,
		providerId: providerUserId,
		status: { $in: APPOINTMENT_ACCESS_STATUSES }
	})
		.select('_id')
		.lean();
	return Boolean(appt);
}

/**
 * Comprueba que la cita pertenece al proveedor, incluye el petId indicado y está en estado permitido para ficha.
 */
async function assertVetAppointmentForPet({ appointmentId, providerUserId, petId }) {
	const appt = await Appointment.findOne({
		_id: appointmentId,
		providerId: providerUserId,
		petId,
		status: { $in: APPOINTMENT_ACCESS_STATUSES }
	}).lean();
	if (!appt || !appt.petId || String(appt.petId) !== String(petId)) {
		return null;
	}
	return appt;
}

module.exports = {
	findPetForOwner,
	vetHasAccessToPet,
	assertVetAppointmentForPet,
	APPOINTMENT_ACCESS_STATUSES
};
