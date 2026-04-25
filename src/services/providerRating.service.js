'use strict';

const mongoose = require('mongoose');
const Review = require('../models/Review');
const User = require('../models/User');
const { REVIEW_DIRECTIONS } = Review;

function round1(n) {
	return Math.round(n * 10) / 10;
}

/** Reseñas públicas del proveedor: solo calificaciones del cliente hacia el profesional. */
function matchClientToProviderOnProvider(providerId) {
	return {
		providerId: new mongoose.Types.ObjectId(providerId),
		$or: [
			{ direction: { $exists: false } },
			{ direction: null },
			{ direction: REVIEW_DIRECTIONS.CLIENT_TO_PROVIDER }
		]
	};
}

function getObservationText(d) {
	if (!d) return '';
	const o = d.observation != null ? String(d.observation).trim() : '';
	if (o) return o;
	const c = d.comment != null ? String(d.comment) : '';
	return c.trim();
}

async function getRatingSummary(providerId) {
	const m = matchClientToProviderOnProvider(providerId);
	const [agg, distRows] = await Promise.all([
		Review.aggregate([{ $match: m }, { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }]),
		Review.aggregate([{ $match: m }, { $group: { _id: '$rating', count: { $sum: 1 } } }])
	]);

	const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
	for (const row of distRows) {
		const k = row._id;
		if (k >= 1 && k <= 5) distribution[k] = row.count;
	}

	const count = agg[0]?.count || 0;
	const average = count > 0 ? round1(agg[0].average) : null;

	return { average, count, distribution };
}

async function getRecentReviews(providerId, limit = 5) {
	const lim = Math.min(50, Math.max(1, limit));
	return Review.find(matchClientToProviderOnProvider(providerId))
		.sort({ createdAt: -1 })
		.limit(lim)
		.populate('ownerId', 'name lastName')
		.lean();
}

async function syncProviderRatingToUser(providerId) {
	const summary = await getRatingSummary(providerId);
	await User.updateOne(
		{ _id: providerId },
		{
			$set: {
				'providerProfile.ratingAverage': summary.count ? summary.average : null,
				'providerProfile.ratingCount': summary.count
			}
		}
	);
	return summary;
}

function formatReviewsForPublic(docs) {
	return docs.map((d) => {
		const text = getObservationText(d);
		return {
			id: d._id,
			rating: d.rating,
			observation: text,
			comment: text,
			createdAt: d.createdAt,
			author: d.ownerId
				? {
						id: d.ownerId._id || d.ownerId,
						name: d.ownerId.name,
						lastName: d.ownerId.lastName
					}
				: null
		};
	});
}

module.exports = {
	getRatingSummary,
	getRecentReviews,
	syncProviderRatingToUser,
	formatReviewsForPublic,
	getObservationText,
	matchClientToProviderOnProvider
};
