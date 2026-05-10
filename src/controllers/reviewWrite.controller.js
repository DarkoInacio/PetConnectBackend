'use strict';

const mongoose = require('mongoose');
const Review = require('../models/Review');
const { REVIEW_DIRECTIONS } = Review;
const { syncProviderRatingToUser, getObservationText } = require('../services/providerRating.service');

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function parsePartialRating(body) {
	if (body.rating === undefined) return { ok: true, value: undefined };
	const r = Number(body.rating);
	if (!Number.isInteger(r) || r < 1 || r > 5) {
		return { error: 'rating debe ser un entero entre 1 y 5' };
	}
	return { ok: true, value: r };
}

function parsePartialObservation(body) {
	if (body.observation === undefined && body.comment === undefined) {
		return { ok: true, value: undefined };
	}
	const raw = body.observation != null ? body.observation : body.comment;
	const text = raw != null ? String(raw).trim() : '';
	if (text.length > 200) {
		return { error: 'La observación no puede superar 200 caracteres' };
	}
	return { ok: true, value: text };
}

/**
 * PATCH /api/reviews/:id — autor de la reseña, ventana 24h desde publicación.
 */
async function updateReview(req, res, next) {
	try {
		const id = req.params.id;
		if (!mongoose.isValidObjectId(id)) {
			return res.status(400).json({ message: 'Id de reseña inválido' });
		}
		const rP = parsePartialRating(req.body || {});
		if (rP.error) {
			return res.status(400).json({ message: rP.error });
		}
		const oP = parsePartialObservation(req.body || {});
		if (oP.error) {
			return res.status(400).json({ message: oP.error });
		}
		if (rP.value === undefined && oP.value === undefined) {
			return res.status(400).json({ message: 'Nada que actualizar' });
		}

		const review = await Review.findById(id);
		if (!review) {
			return res.status(404).json({ message: 'Reseña no encontrada' });
		}
		if (Date.now() - new Date(review.createdAt).getTime() > EDIT_WINDOW_MS) {
			return res.status(403).json({ message: 'Solo se puede editar en las 24 h posteriores a publicar' });
		}

		const uid = String(req.user.id);
		const dir = review.direction || REVIEW_DIRECTIONS.CLIENT_TO_PROVIDER;
		const isClientReview =
			dir === REVIEW_DIRECTIONS.CLIENT_TO_PROVIDER && String(review.ownerId) === uid;
		const isProviderToClient = dir === REVIEW_DIRECTIONS.PROVIDER_TO_CLIENT && String(review.providerId) === uid;
		if (!isClientReview && !isProviderToClient) {
			return res.status(403).json({ message: 'No eres el autor de esta reseña' });
		}

		if (rP.value !== undefined) {
			review.rating = rP.value;
		}
		if (oP.value !== undefined) {
			review.observation = oP.value;
		}
		await review.save();

		if (dir !== REVIEW_DIRECTIONS.PROVIDER_TO_CLIENT) {
			await syncProviderRatingToUser(review.providerId);
		}

		return res.status(200).json({
			message: 'Reseña actualizada',
			review: {
				id: String(review._id),
				rating: review.rating,
				observation: getObservationText(review),
				comment: getObservationText(review)
			}
		});
	} catch (err) {
		next(err);
	}
}

module.exports = { updateReview };
