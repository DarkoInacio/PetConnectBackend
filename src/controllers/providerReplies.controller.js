'use strict';

const mongoose = require('mongoose');
const Review = require('../models/Review');
const User = require('../models/User');
const { canProviderEditReply } = require('../services/reviewRules.service');
const { REVIEW_REPLY_MAX } = require('../models/Review');
const { syncProviderRatingToUser, getRatingSummary, getRecentReviews, formatReviewsForPublic } = require('../services/providerRating.service');
const { notifyOwnerProviderRepliedToReview, providerDisplayName } = require('../utils/notifyReview');

/**
 * GET /api/provider/reviews
 * orden: sin_responder primero (query ?prioridad=pendientes, default)
 */
async function listProviderReviewsForMe(req, res, next) {
	try {
		const providerId = req.user.id;
		const prioridadPendientes = String(req.query.prioridad || 'pendientes') === 'pendientes';
		const q = { providerId, removedByAdmin: { $ne: true } };
		const cursor = Review.find(q)
			.populate('ownerId', 'name lastName email')
			.lean();
		const docs = await cursor;
		const withState = docs.map((d) => {
			const hasReply = d.providerReply && d.providerReply.text;
			return {
				...d,
				estadoRespuesta: hasReply ? 'respondida' : 'sin_responder'
			};
		});
		if (prioridadPendientes) {
			withState.sort((a, b) => {
				const ap = a.estadoRespuesta === 'sin_responder' ? 0 : 1;
				const bp = b.estadoRespuesta === 'sin_responder' ? 0 : 1;
				if (ap !== bp) return ap - bp;
				return new Date(b.createdAt) - new Date(a.createdAt);
			});
		} else {
			withState.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
		}
		return res.status(200).json({ reviews: withState, total: withState.length });
	} catch (e) {
		next(e);
	}
}

/**
 * PUT /api/provider/reviews/:reviewId/reply
 */
async function upsertProviderReply(req, res, next) {
	try {
		const { reviewId } = req.params;
		if (!mongoose.isValidObjectId(reviewId)) {
			return res.status(400).json({ message: 'Id inválido' });
		}
		const text = req.body?.text != null ? String(req.body.text).trim() : '';
		if (!text) {
			return res.status(400).json({ message: 'text es obligatorio' });
		}
		if (text.length > REVIEW_REPLY_MAX) {
			return res.status(400).json({ message: `La respuesta no puede superar ${REVIEW_REPLY_MAX} caracteres` });
		}
		const review = await Review.findById(reviewId);
		if (!review) {
			return res.status(404).json({ message: 'Reseña no encontrada' });
		}
		if (String(review.providerId) !== req.user.id) {
			return res.status(403).json({ message: 'Solo el proveedor de la reseña puede responder' });
		}
		if (review.removedByAdmin) {
			return res.status(400).json({ message: 'No se puede responder a esta reseña' });
		}
		const isEdit = review.providerReply && review.providerReply.text;
		if (isEdit) {
			if (!canProviderEditReply(review)) {
				return res
					.status(400)
					.json({ message: 'Solo se puede editar la respuesta dentro de las 48 h desde su publicación' });
			}
			review.providerReply = review.providerReply || {};
			review.providerReply.text = text;
			review.providerReply.updatedAt = new Date();
		} else {
			review.providerReply = {
				text,
				createdAt: new Date(),
				updatedAt: new Date()
			};
		}
		await review.save();
		const [owner, prov] = await Promise.all([
			User.findById(review.ownerId).select('name lastName email'),
			User.findById(review.providerId).select('name lastName email')
		]);
		notifyOwnerProviderRepliedToReview({ ownerUser: owner, providerUser: prov, review: review.toObject() }).catch(
			(e) => console.error('notifyOwnerProviderReplied', e.message)
		);
		return res.status(200).json({
			message: isEdit ? 'Respuesta actualizada' : 'Respuesta publicada',
			review: await Review.findById(reviewId).lean()
		});
	} catch (e) {
		next(e);
	}
}

module.exports = { listProviderReviewsForMe, upsertProviderReply };
