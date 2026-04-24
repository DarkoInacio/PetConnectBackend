'use strict';

const mongoose = require('mongoose');
const Review = require('../models/Review');
const User = require('../models/User');

function round1(n) {
	return Math.round(n * 10) / 10;
}

function activeReviewMatch(providerId) {
	const pid = new mongoose.Types.ObjectId(providerId);
	return { providerId: pid, removedByAdmin: { $ne: true } };
}

async function getRatingSummary(providerId) {
	const pid = new mongoose.Types.ObjectId(providerId);
	const match = activeReviewMatch(providerId);
	const [agg, distRows] = await Promise.all([
		Review.aggregate([
			{ $match: match },
			{ $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
		]),
		Review.aggregate([
			{ $match: match },
			{ $group: { _id: '$rating', count: { $sum: 1 } } }
		])
	]);

	const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
	for (const row of distRows) {
		const k = row._id;
		if (k >= 1 && k <= 5) distribution[k] = row.count;
	}

	const count = agg[0]?.count || 0;
	const average = count > 0 ? round1(agg[0].average) : null;

	const distributionWithPercent = {};
	for (let s = 1; s <= 5; s++) {
		const c = distribution[s] || 0;
		distributionWithPercent[s] = {
			count: c,
			percent: count > 0 ? round1((c / count) * 100) : 0
		};
	}

	return { average, count, distribution, distributionWithPercent };
}

async function getRecentReviews(providerId, limit = 5) {
	const lim = Math.min(50, Math.max(1, limit));
	return Review.find(activeReviewMatch(providerId))
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

function formatReviewsForPublic(docs, options = {}) {
	const establishmentName = options.establishmentName;
	return docs.map((d) => {
		const out = {
			id: d._id,
			rating: d.rating,
			comment: d.comment || '',
			createdAt: d.createdAt,
			author: d.ownerId
				? {
						id: d.ownerId._id || d.ownerId,
						name: d.ownerId.name,
						lastName: d.ownerId.lastName
					}
				: null
		};
		if (d.providerReply && d.providerReply.text) {
			out.providerResponse = {
				text: d.providerReply.text,
				createdAt: d.providerReply.createdAt,
				updatedAt: d.providerReply.updatedAt,
				label: 'Respuesta del proveedor',
				establishmentName: establishmentName || null
			};
		} else {
			out.providerResponse = null;
		}
		return out;
	});
}

module.exports = {
	getRatingSummary,
	getRecentReviews,
	syncProviderRatingToUser,
	formatReviewsForPublic,
	activeReviewMatch
};
