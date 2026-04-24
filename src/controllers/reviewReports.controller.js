'use strict';

const mongoose = require('mongoose');
const Review = require('../models/Review');
const User = require('../models/User');
const ReviewReport = require('../models/ReviewReport');
const { notifyAdminsNewReport, notifyOwnerReviewRemoved } = require('../utils/notifyReview');
const { syncProviderRatingToUser } = require('../services/providerRating.service');

const OTHER_MAX = 300;

/**
 * POST /api/reviews/:reviewId/report
 */
async function createReport(req, res, next) {
	try {
		const { reviewId } = req.params;
		if (!mongoose.isValidObjectId(reviewId)) {
			return res.status(400).json({ message: 'Id inválido' });
		}
		const { reason, otherText } = req.body || {};
		if (!reason || !ReviewReport.REPORT_REASONS.includes(reason)) {
			return res.status(400).json({
				message: `reason obligatorio. Valores: ${ReviewReport.REPORT_REASONS.join(', ')}`
			});
		}
		let other = otherText != null ? String(otherText).trim() : '';
		if (reason === 'otro' && !other) {
			return res.status(400).json({ message: 'Con motivo "otro" debe indicar un texto' });
		}
		if (other.length > OTHER_MAX) {
			return res.status(400).json({ message: `Texto adicional máximo ${OTHER_MAX} caracteres` });
		}
		if (reason !== 'otro') {
			other = '';
		}
		const review = await Review.findById(reviewId);
		if (!review || review.removedByAdmin) {
			return res.status(404).json({ message: 'Reseña no encontrada' });
		}
		if (String(review.ownerId) === req.user.id) {
			return res.status(400).json({ message: 'No puedes reportar tu propia reseña' });
		}
		try {
			const report = await ReviewReport.create({
				reviewId: review._id,
				reporterId: req.user.id,
				reason,
				otherText: other
			});
			const [reporter, revPop] = await Promise.all([
				User.findById(req.user.id).select('name lastName email'),
				Review.findById(review._id).lean()
			]);
			notifyAdminsNewReport({ report, review: revPop, reporter }).catch((e) =>
				console.error('notifyAdminsNewReport', e.message)
			);
			return res.status(201).json({
				message: 'Tu reporte fue enviado. Lo revisaremos a la brevedad.',
				reportId: report._id
			});
		} catch (e) {
			if (e.code === 11000) {
				return res.status(409).json({ message: 'Ya reportaste esta reseña' });
			}
			throw e;
		}
	} catch (e) {
		next(e);
	}
}

module.exports = { createReport, OTHER_MAX };
