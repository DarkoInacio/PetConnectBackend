'use strict';

/**
 * Cita en estado que permite dejar reseña: completada, o confirmada cuya hora de fin ya pasó.
 */
function isAppointmentReviewable(appointment) {
	if (!appointment) return false;
	const st = appointment.status;
	if (st === 'completed') return true;
	if (st === 'confirmed' && appointment.endAt && new Date(appointment.endAt) <= new Date()) {
		return true;
	}
	return false;
}

const OWNER_EDIT_MS = 24 * 60 * 60 * 1000;
const PROVIDER_REPLY_EDIT_MS = 48 * 60 * 60 * 1000;

function canOwnerEditReview(review) {
	if (!review || !review.createdAt) return false;
	return Date.now() - new Date(review.createdAt).getTime() <= OWNER_EDIT_MS;
}

function canProviderEditReply(review) {
	if (!review || !review.providerReply || !review.providerReply.text || !review.providerReply.createdAt) {
		return false;
	}
	return Date.now() - new Date(review.providerReply.createdAt).getTime() <= PROVIDER_REPLY_EDIT_MS;
}

module.exports = {
	isAppointmentReviewable,
	canOwnerEditReview,
	canProviderEditReply,
	OWNER_EDIT_MS,
	PROVIDER_REPLY_EDIT_MS
};
