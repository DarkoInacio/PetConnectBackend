'use strict';

const mongoose = require('mongoose');
const Review = require('../models/Review');
const User = require('../models/User');
const { canOwnerEditReview } = require('../services/reviewRules.service');
const { REVIEW_COMMENT_MAX } = require('../models/Review');
const {
	getRatingSummary,
	getRecentReviews,
	syncProviderRatingToUser,
	formatReviewsForPublic
} = require('../services/providerRating.service');
const { providerDisplayName } = require('../utils/notifyReview');

/**
 * PATCH /api/reviews/:reviewId — solo dueño, ventana 24h
 */
async function updateMyReview(req, res, next) {
	try {
		const { reviewId } = req.params;
		if (!mongoose.isValidObjectId(reviewId)) {
			return res.status(400).json({ message: 'Id de reseña inválido' });
		}
		const { rating, comment } = req.body || {};
		const review = await Review.findById(reviewId);
		if (!review) {
			return res.status(404).json({ message: 'Reseña no encontrada' });
		}
		if (String(review.ownerId) !== req.user.id) {
			return res.status(403).json({ message: 'Solo puedes editar tus reseñas' });
		}
		if (review.removedByAdmin) {
			return res.status(400).json({ message: 'Esta reseña no puede editarse' });
		}
		if (!canOwnerEditReview(review)) {
			return res
				.status(400)
				.json({ message: 'Solo se puede editar dentro de las 24 horas posteriores a publicar' });
		}
		if (rating !== undefined) {
			const r = Number(rating);
			if (!Number.isInteger(r) || r < 1 || r > 5) {
				return res.status(400).json({ message: 'rating debe ser entero 1-5' });
			}
			review.rating = r;
		}
		if (comment !== undefined) {
			const t = String(comment).trim();
			if (t.length > REVIEW_COMMENT_MAX) {
				return res.status(400).json({ message: `Comentario máximo ${REVIEW_COMMENT_MAX} caracteres` });
			}
			review.comment = t;
		}
		await review.save();
		await syncProviderRatingToUser(review.providerId);
		const [summary, recent] = await Promise.all([
			getRatingSummary(review.providerId),
			getRecentReviews(review.providerId, 5)
		]);
		const prov = await User.findById(review.providerId).select('name lastName');
		return res.status(200).json({
			message: 'Reseña actualizada',
			review,
			ratingSummary: summary,
			reviewsRecent: formatReviewsForPublic(recent, {
				establishmentName: prov ? providerDisplayName(prov) : null
			})
		});
	} catch (e) {
		next(e);
	}
}

module.exports = { updateMyReview };
