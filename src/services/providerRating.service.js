'use strict';

const mongoose = require('mongoose');
const Review = require('../models/Review');
const User = require('../models/User');

function round1(n) {
	return Math.round(n * 10) / 10;
}

async function getRatingSummary(providerId) {
	const pid = new mongoose.Types.ObjectId(providerId);
	const [agg, distRows] = await Promise.all([
		Review.aggregate([
			{ $match: { providerId: pid } },
			{ $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
		]),
		Review.aggregate([
			{ $match: { providerId: pid } },
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

	return { average, count, distribution };
}

async function getRecentReviews(providerId, limit = 5) {
	const lim = Math.min(50, Math.max(1, limit));
	return Review.find({ providerId })
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
	return docs.map((d) => ({
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
	}));
}

module.exports = {
	getRatingSummary,
	getRecentReviews,
	syncProviderRatingToUser,
	formatReviewsForPublic
};
