'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Review = require('../models/Review');
const { activeReviewMatch, getRatingSummary, formatReviewsForPublic } = require('../services/providerRating.service');
const { providerDisplayName } = require('../utils/notifyReview');

/**
 * GET /api/proveedores/:providerId/reviews
 * Query: pagina, limite (default 5), orden=reciente|mayor|menor
 */
async function listProviderReviews(req, res, next) {
	try {
		const { providerId } = req.params;
		if (!mongoose.isValidObjectId(providerId)) {
			return res.status(400).json({ message: 'Id de proveedor inválido' });
		}

		const prov = await User.findById(providerId).select('role status providerProfile.isPublished name lastName');
		if (!prov || prov.role !== 'proveedor' || prov.status !== 'aprobado') {
			return res.status(404).json({ message: 'Proveedor no encontrado' });
		}
		if (prov.providerProfile && prov.providerProfile.isPublished === false) {
			return res.status(404).json({ message: 'Proveedor no encontrado' });
		}

		const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
		const limiteRaw = parseInt(req.query.limite, 10) || 5;
		const limite = Math.min(50, Math.max(1, limiteRaw));
		const skip = (pagina - 1) * limite;
		const orden = String(req.query.orden || 'reciente').toLowerCase();
		const establishmentName = providerDisplayName(prov);
		const match = activeReviewMatch(providerId);
		let sort = { createdAt: -1 };
		if (orden === 'mayor' || orden === 'alta' || orden === 'rating_mayor') {
			sort = { rating: -1, createdAt: -1 };
		} else if (orden === 'menor' || orden === 'baja' || orden === 'rating_menor') {
			sort = { rating: 1, createdAt: -1 };
		}
		const [total, docs, summary] = await Promise.all([
			Review.countDocuments(match),
			Review.find(match).sort(sort).skip(skip).limit(limite).populate('ownerId', 'name lastName').lean(),
			getRatingSummary(providerId)
		]);

		return res.status(200).json({
			ratingSummary: summary,
			basedOnLabel: `Basado en ${summary.count} reseña${summary.count === 1 ? '' : 's'}`,
			total,
			pagina,
			limite,
			orden: orden,
			empty: total === 0,
			emptyHint: total === 0 ? 'Sé el primero en compartir tu opinión sobre este proveedor' : null,
			reviews: formatReviewsForPublic(docs, { establishmentName })
		});
	} catch (err) {
		next(err);
	}
}

module.exports = {
	listProviderReviews
};
