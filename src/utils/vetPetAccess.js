'use strict';

const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');

/**
 * La veterinaria puede ver datos de la mascota si tiene alguna cita con esa mascota (franja agendada).
 */
async function vetCanAccessPet(providerId, petId) {
	if (!mongoose.Types.ObjectId.isValid(petId)) return false;
	return Appointment.exists({
		providerId,
		petId,
		status: { $in: ['pending_confirmation', 'confirmed', 'completed'] }
	});
}

/**
 * Pacientes listados: al menos una cita completada en esta clínica.
 */
async function vetHasCompletedVisit(providerId, petId) {
	if (!mongoose.Types.ObjectId.isValid(petId)) return false;
	return Appointment.exists({
		providerId,
		petId,
		status: 'completed'
	});
}

module.exports = { vetCanAccessPet, vetHasCompletedVisit };
