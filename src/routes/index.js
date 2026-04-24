'use strict';

const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/profile', require('./profile.routes'));
router.use('/provider/agenda', require('./providerAgenda.routes'));
router.use('/appointments', require('./appointments.routes'));
router.use('/bookings', require('./bookings.routes'));
router.use('/admin/jobs', require('./adminJobs.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/proveedores', require('./providers.routes'));
router.use('/citas', require('./ownerAppointments.routes'));
router.use('/pets', require('./pets.routes'));
router.use('/vet', require('./vetClinical.routes'));
router.use('/reviews', require('./reviews.routes'));
router.use('/provider/reviews', require('./providerReviewsPanel.routes'));

module.exports = router;
