'use strict';

const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const Review = require('../models/Review');
const { isAppointmentReviewable } = require('../services/reviewRules.service');
const {
	getRatingSummary,
	getRecentReviews,
	syncProviderRatingToUser,
	formatReviewsForPublic
} = require('../services/providerRating.service');
const { notifyProviderNewReview } = require('../utils/notifyReview');
const { REVIEW_COMMENT_MAX } = require('../models/Review');

async function getReviewEligibility(req, res, next) {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id)) {
			return res.status(400).json({ message: 'Id de cita inválido' });
		}
		const appt = await Appointment.findById(id).lean();
		if (!appt) {
			return res.status(404).json({ message: 'Cita no encontrada' });
		}
		if (String(appt.ownerId) !== req.user.id) {
			return res.status(403).json({ message: 'Solo el dueño de la cita puede consultar' });
		}
		const existing = await Review.findOne({ appointmentId: appt._id })
			.select('_id rating comment createdAt')
			.lean();
		const canReview = isAppointmentReviewable(appt) && !existing;
		return res.status(200).json({
			canReview,
			hasReview: Boolean(existing),
			reviewId: existing?._id || null,
			review: existing
				? {
						rating: existing.rating,
						comment: existing.comment || '',
						createdAt: existing.createdAt
					}
				: null,
			appointmentStatus: appt.status
		});
	} catch (e) {
		next(e);
	}
}

/**
 * Cita “legacy” (Cita) con completed en cita: permitir reseña si hay enlace; por simplicidad solo Appointments híbridos
 * POST /api/appointments/:id/reviews
 */
async function createReviewForAppointment(req, res, next) {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id)) {
			return res.status(400).json({ message: 'Id de cita inválido' });
		}
		const owner = await User.findById(req.user.id).select('reviewWriteSuspended');
		if (owner && owner.reviewWriteSuspended) {
			return res.status(403).json({ message: 'No puedes publicar reseñas en este momento' });
		}

		const { rating, comment } = req.body || {};
		const r = Number(rating);
		if (!Number.isInteger(r) || r < 1 || r > 5) {
			return res.status(400).json({ message: 'rating debe ser un entero entre 1 y 5' });
		}
		const text = comment != null ? String(comment).trim() : '';
		if (text.length > REVIEW_COMMENT_MAX) {
			return res.status(400).json({ message: `El comentario no puede superar ${REVIEW_COMMENT_MAX} caracteres` });
		}

		const appt = await Appointment.findById(id);
		if (!appt) {
			return res.status(404).json({ message: 'Cita no encontrada' });
		}
		if (String(appt.ownerId) !== req.user.id) {
			return res.status(403).json({ message: 'Solo el dueño de la cita puede reseñar' });
		}
		if (!isAppointmentReviewable(appt)) {
			return res
				.status(400)
				.json({ message: 'Solo se puede reseñar una cita finalizada o ya realizada' });
		}

		const dup = await Review.findOne({ appointmentId: appt._id }).select('_id').lean();
		if (dup) {
			return res.status(409).json({ message: 'Ya existe una reseña para esta cita' });
		}

		const [prov, ownerU] = await Promise.all([
			User.findById(appt.providerId).select('email name lastName status role roles'),
			User.findById(req.user.id).select('name lastName email')
		]);
		const provOk =
			prov &&
			prov.status === 'aprobado' &&
			(prov.role === 'proveedor' || (Array.isArray(prov.roles) && prov.roles.includes('proveedor')));
		if (!provOk) {
			return res.status(400).json({ message: 'Proveedor no disponible' });
		}

		const review = await Review.create({
			appointmentId: appt._id,
			providerId: appt.providerId,
			ownerId: req.user.id,
			rating: r,
			comment: text
		});

		await syncProviderRatingToUser(appt.providerId);

		const [summary, recent] = await Promise.all([
			getRatingSummary(appt.providerId),
			getRecentReviews(appt.providerId, 5)
		]);
		const establishmentName = `${prov.name || ''} ${prov.lastName || ''}`.trim();
		notifyProviderNewReview({ providerUser: prov, ownerUser: ownerU, review: review.toObject() }).catch(
			(e) => console.error('notifyProviderNewReview', e.message)
		);

		return res.status(201).json({
			message: 'Reseña registrada',
			review,
			ratingSummary: summary,
			reviewsRecent: formatReviewsForPublic(recent, { establishmentName })
		});
	} catch (e) {
		if (e.code === 11000) {
			return res.status(409).json({ message: 'Ya existe una reseña para esta cita' });
		}
		next(e);
	}
}

module.exports = {
	getReviewEligibility,
	createReviewForAppointment
};
