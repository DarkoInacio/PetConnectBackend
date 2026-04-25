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
	completeProviderWalkerAppointment,
	completeProviderVetClinicAppointment,
	completeProviderVisit
} = require('../controllers/appointments.controller');
const {
	getReviewEligibility,
	createReviewForAppointment
} = require('../controllers/appointmentReviews.controller');

router.get('/providers/:providerId/available-slots', auth, authorizeRoles('dueno'), listAvailableSlotsByProvider);

router.get('/:id/review-eligibility', auth, authorizeRoles('dueno'), getReviewEligibility);
router.post('/:id/reviews', auth, authorizeRoles('dueno'), createReviewForAppointment);

router.post('/', auth, authorizeRoles('dueno'), createAppointment);
router.get('/mine', auth, authorizeRoles('dueno'), listMyAppointments);
router.patch('/:id/provider/confirm', auth, authorizeRoles('proveedor'), confirmProviderAppointment);
router.patch('/:id/provider/complete-vet', auth, authorizeRoles('proveedor'), completeProviderVetClinicAppointment);
router.patch('/:id/provider/complete-walker', auth, authorizeRoles('proveedor'), completeProviderWalkerAppointment);
router.patch('/:id/provider/complete-visit', auth, authorizeRoles('proveedor'), completeProviderVisit);
router.patch('/:id/provider/cancel', auth, authorizeRoles('proveedor'), cancelProviderAppointment);
router.patch('/:id/cancel', auth, authorizeRoles('dueno'), cancelMyAppointment);

module.exports = router;
