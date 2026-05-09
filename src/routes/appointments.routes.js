'use strict';

const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const ensureVeterinariaProvider = require('../middlewares/ensureVeterinariaProvider');
const {
	listAvailableSlotsByProvider,
	createAppointment,
	listMyAppointments,
	cancelMyAppointment
} = require('../controllers/appointments.controller');
const {
	confirmAppointmentAsProvider,
	cancelAppointmentAsProvider,
	completeVetClinicAppointmentAsProvider,
	completeWalkerAppointmentAsProvider,
	patchAppointmentInternalNotes
} = require('../controllers/appointmentsProvider.controller');

router.get('/providers/:providerId/available-slots', auth, authorizeRoles('dueno'), listAvailableSlotsByProvider);

router.post('/', auth, authorizeRoles('dueno'), createAppointment);
router.get('/mine', auth, authorizeRoles('dueno'), listMyAppointments);
router.patch('/:id/cancel', auth, authorizeRoles('dueno'), cancelMyAppointment);

router.patch('/:id/provider/confirm', auth, authorizeRoles('proveedor'), confirmAppointmentAsProvider);
router.patch('/:id/provider/cancel', auth, authorizeRoles('proveedor'), cancelAppointmentAsProvider);
router.patch('/:id/provider/complete-vet', auth, authorizeRoles('proveedor'), completeVetClinicAppointmentAsProvider);
router.patch('/:id/provider/complete-walker', auth, authorizeRoles('proveedor'), completeWalkerAppointmentAsProvider);
router.patch(
	'/:id/provider/internal-notes',
	auth,
	authorizeRoles('proveedor'),
	ensureVeterinariaProvider,
	patchAppointmentInternalNotes
);

module.exports = router;
