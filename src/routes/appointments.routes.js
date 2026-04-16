'use strict';

const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const {
	listAvailableSlotsByProvider,
	createAppointment,
	listMyAppointments,
	cancelMyAppointment,
	confirmProviderAppointment,
	cancelProviderAppointment,
	completeProviderWalkerAppointment
} = require('../controllers/appointments.controller');

router.get('/providers/:providerId/available-slots', auth, authorizeRoles('dueno'), listAvailableSlotsByProvider);

router.post('/', auth, authorizeRoles('dueno'), createAppointment);
router.get('/mine', auth, authorizeRoles('dueno'), listMyAppointments);
router.patch('/:id/provider/confirm', auth, authorizeRoles('proveedor'), confirmProviderAppointment);
router.patch('/:id/provider/complete-walker', auth, authorizeRoles('proveedor'), completeProviderWalkerAppointment);
router.patch('/:id/provider/cancel', auth, authorizeRoles('proveedor'), cancelProviderAppointment);
router.patch('/:id/cancel', auth, authorizeRoles('dueno'), cancelMyAppointment);

module.exports = router;
