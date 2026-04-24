'use strict';

const express = require('express');
const { isSpaScope } = require('../config/apiScope');

const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/profile', require('./profile.routes'));
router.use('/provider/agenda', require('./providerAgenda.routes'));
router.use('/provider/clinic-services', require('./clinicServices.routes'));
router.use('/appointments', require('./appointments.routes'));
router.use('/bookings', require('./bookings.routes'));

if (!isSpaScope()) {
	router.use('/admin/jobs', require('./adminJobs.routes'));
}

router.use('/admin', require('./admin.routes'));
router.use('/proveedores', require('./providers.routes'));
router.use('/citas', require('./ownerAppointments.routes'));

if (!isSpaScope()) {
	router.use('/pets', require('./pets.routes'));
	router.use('/vet', require('./vetClinical.routes'));
}

module.exports = router;
