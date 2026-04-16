'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const {
	createOwnerAppointment,
	listMyAppointments,
	listUpcomingAppointments,
	cancelAppointment,
	rescheduleAppointment,
	recordDiagnosis,
	confirmCitaAsProvider,
	cancelCitaAsProvider
} = require('../controllers/ownerAppointments.controller');

router.post('/', auth, authorizeRoles('dueno'), createOwnerAppointment);

router.get('/mis-citas', auth, authorizeRoles('dueno'), listMyAppointments);

router.get('/proximas', auth, authorizeRoles('dueno'), listUpcomingAppointments);

router.patch('/:id/proveedor/confirmar', auth, authorizeRoles('proveedor'), confirmCitaAsProvider);
router.patch('/:id/proveedor/cancelar', auth, authorizeRoles('proveedor'), cancelCitaAsProvider);

router.patch('/:id/cancelar', auth, authorizeRoles('dueno'), cancelAppointment);

router.patch('/:id/reagendar', auth, authorizeRoles('dueno'), rescheduleAppointment);

router.patch('/:id/diagnostico', auth, authorizeRoles('proveedor'), recordDiagnosis);

module.exports = router;
