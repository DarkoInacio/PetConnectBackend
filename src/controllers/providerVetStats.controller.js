'use strict';

const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const User = require('../models/User');

function monthBoundsUtc(referenceDate = new Date()) {
	const start = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1, 0, 0, 0, 0));
	const end = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
	return { start, end };
}

async function getVetProviderSummary(req, res, next) {
	try {
		if (!mongoose.isValidObjectId(req.user.id)) {
			return res.status(401).json({ message: 'Usuario inválido' });
		}

		const providerObjectId = new mongoose.Types.ObjectId(req.user.id);
		const { start, end } = monthBoundsUtc();

		const [monthAppointmentsCount, pendingConfirmationCount, me] = await Promise.all([
			Appointment.countDocuments({
				providerId: providerObjectId,
				startAt: { $gte: start, $lte: end }
			}),
			Appointment.countDocuments({
				providerId: providerObjectId,
				status: 'pending_confirmation'
			}),
			User.findById(req.user.id)
				.select('providerProfile.ratingAverage providerProfile.ratingCount')
				.lean()
		]);

		const ratingAverage =
			me?.providerProfile && typeof me.providerProfile.ratingAverage === 'number'
				? me.providerProfile.ratingAverage
				: null;
		const reviewCount =
			me?.providerProfile && typeof me.providerProfile.ratingCount === 'number'
				? me.providerProfile.ratingCount
				: 0;

		return res.status(200).json({
			monthAppointmentsCount,
			pendingConfirmationCount,
			ratingAverage,
			reviewCount
		});
	} catch (error) {
		next(error);
	}
}

module.exports = { getVetProviderSummary };
