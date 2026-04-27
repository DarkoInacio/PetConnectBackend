'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Review = require('../models/Review');
const {
	getRatingSummary,
	getRecentReviews,
	syncProviderRatingToUser,
	formatReviewsForPublic
} = require('../services/providerRating.service');
const { isProveedorAprobado } = require('../utils/providerEligibility');

/**
 * POST /api/proveedores/:providerId/reviews
 */
async function createProviderReview(req, res, next) {
	try {
		const { providerId } = req.params;
		if (!mongoose.isValidObjectId(providerId)) {
			return res.status(400).json({ message: 'Id de proveedor inválido' });
		}

		const { rating, comment } = req.body || {};
		const r = Number(rating);
		if (!Number.isInteger(r) || r < 1 || r > 5) {
			return res.status(400).json({ message: 'rating debe ser un entero entre 1 y 5' });
		}

		const text = comment != null ? String(comment).trim() : '';
		if (text.length > 2000) {
			return res.status(400).json({ message: 'comment no puede superar 2000 caracteres' });
		}

		if (String(req.user.id) === String(providerId)) {
			return res.status(400).json({ message: 'No puede reseñar su propio perfil de proveedor' });
		}

		const prov = await User.findById(providerId).select('role status providerProfile.isPublished');
		if (!prov || !isProveedorAprobado(prov)) {
			return res.status(404).json({ message: 'Proveedor no encontrado' });
		}
		if (prov.providerProfile && prov.providerProfile.isPublished === false) {
			return res.status(404).json({ message: 'Proveedor no encontrado' });
		}

		try {
			await Review.create({
				providerId,
				ownerId: req.user.id,
				rating: r,
				comment: text
			});
		} catch (err) {
			if (err.code === 11000) {
				return res.status(409).json({ message: 'Ya existe una reseña suya para este proveedor' });
			}
			throw err;
		}

		await syncProviderRatingToUser(providerId);

		const summary = await getRatingSummary(providerId);
		const recent = await getRecentReviews(providerId, 5);

		return res.status(201).json({
			message: 'Reseña registrada',
			ratingSummary: summary,
			reviewsRecent: formatReviewsForPublic(recent)
		});
	} catch (err) {
		next(err);
	}
}

/**
 * GET /api/proveedores/:providerId/reviews?pagina=1&limite=10
 */
async function listProviderReviews(req, res, next) {
	try {
		const { providerId } = req.params;
		if (!mongoose.isValidObjectId(providerId)) {
			return res.status(400).json({ message: 'Id de proveedor inválido' });
		}

		const prov = await User.findById(providerId).select('role status providerProfile.isPublished');
		if (!prov || !isProveedorAprobado(prov)) {
			return res.status(404).json({ message: 'Proveedor no encontrado' });
		}
		if (prov.providerProfile && prov.providerProfile.isPublished === false) {
			return res.status(404).json({ message: 'Proveedor no encontrado' });
		}

		const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
		const limiteRaw = parseInt(req.query.limite, 10) || 10;
		const limite = Math.min(50, Math.max(1, limiteRaw));
		const skip = (pagina - 1) * limite;

		const [total, docs, summary] = await Promise.all([
			Review.countDocuments({ providerId }),
			Review.find({ providerId })
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limite)
				.populate('ownerId', 'name lastName')
				.lean(),
			getRatingSummary(providerId)
		]);

		return res.status(200).json({
			ratingSummary: summary,
			total,
			pagina,
			limite,
			reviews: formatReviewsForPublic(docs)
		});
	} catch (err) {
		next(err);
	}
}

module.exports = {
	createProviderReview,
	listProviderReviews
};
