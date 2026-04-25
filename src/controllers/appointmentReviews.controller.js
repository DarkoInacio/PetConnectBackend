'use strict';

const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const Review = require('../models/Review');
const { REVIEW_DIRECTIONS } = Review;
const { syncProviderRatingToUser, getObservationText } = require('../services/providerRating.service');

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function parseRating(body) {
	const r = Number(body && body.rating);
	if (!Number.isInteger(r) || r < 1 || r > 5) {
		return { error: 'rating debe ser un entero entre 1 y 5' };
	}
	return { value: r };
}

function parseObservation(body) {
	const raw = body && (body.observation != null ? body.observation : body.comment);
	const text = raw != null ? String(raw).trim() : '';
	if (text.length > 200) {
		return { error: 'La observación no puede superar 200 caracteres' };
	}
	return { value: text };
}

function canEditReview(reviewDoc) {
	if (!reviewDoc || !reviewDoc.createdAt) return false;
	return Date.now() - new Date(reviewDoc.createdAt).getTime() < EDIT_WINDOW_MS;
}

function buildC2PState(appointment, existing) {
	if (appointment.status !== 'completed') {
		return {
			canReview: false,
			hasReview: false,
			canEdit: false,
			reviewId: null,
			review: null
		};
	}
	if (existing) {
		const text = getObservationText(existing);
		const ce = canEditReview(existing);
		return {
			canReview: false,
			hasReview: true,
			canEdit: ce,
			reviewId: String(existing._id),
			review: { rating: existing.rating, comment: text, observation: text }
		};
	}
	return {
		canReview: true,
		hasReview: false,
		canEdit: false,
		reviewId: null,
		review: null
	};
}

function buildP2CState(appointment, existing, allowProvider) {
	if (!allowProvider) {
		return {
			canReviewClient: false,
			hasClientReview: false,
			canEditClient: false,
			clientReviewId: null,
			clientReview: null
		};
	}
	if (appointment.status !== 'completed') {
		return {
			canReviewClient: false,
			hasClientReview: false,
			canEditClient: false,
			clientReviewId: null,
			clientReview: null
		};
	}
	if (existing) {
		const text = getObservationText(existing);
		return {
			canReviewClient: false,
			hasClientReview: true,
			canEditClient: canEditReview(existing),
			clientReviewId: String(existing._id),
			clientReview: { rating: existing.rating, comment: text, observation: text }
		};
	}
	return {
		canReviewClient: true,
		hasClientReview: false,
		canEditClient: false,
		clientReviewId: null,
		clientReview: null
	};
}

/**
 * GET /api/appointments/:id/review-eligibility
 */
async function getAppointmentReviewEligibility(req, res, next) {
	try {
		const id = req.params.id;
		if (!mongoose.isValidObjectId(id)) {
			return res.status(400).json({ message: 'Id de cita inválido' });
		}
		const appointment = await Appointment.findById(id).lean();
		if (!appointment) {
			return res.status(404).json({ message: 'Cita no encontrada' });
		}

		const userId = String(req.user.id);
		const isOwner = String(appointment.ownerId) === userId;
		const isProvider = String(appointment.providerId) === userId;
		if (!isOwner && !isProvider) {
			return res.status(403).json({ message: 'No participas en esta cita' });
		}

		const [c2p, p2c, provUser] = await Promise.all([
			Review.findOne({ appointmentId: id, direction: REVIEW_DIRECTIONS.CLIENT_TO_PROVIDER }).lean(),
			Review.findOne({ appointmentId: id, direction: REVIEW_DIRECTIONS.PROVIDER_TO_CLIENT }).lean(),
			User.findById(appointment.providerId).select('providerType').lean()
		]);
		const providerType = provUser?.providerType;
		const allowP2C = isProvider && ['paseador', 'cuidador'].includes(String(providerType || ''));

		const c2pState = isOwner
			? buildC2PState(appointment, c2p)
			: {
					canReview: false,
					hasReview: !!c2p,
					canEdit: false,
					reviewId: c2p ? String(c2p._id) : null,
					review: null
				};

		const p2cState = isProvider
			? buildP2CState(appointment, p2c, allowP2C)
			: {
					canReviewClient: false,
					hasClientReview: !!p2c,
					canEditClient: false,
					clientReviewId: p2c ? String(p2c._id) : null,
					clientReview: null
				};

		/* Dueño: solo rellena sección cliente → proveedor */
		if (isOwner && !isProvider) {
			return res.status(200).json({
				appointmentStatus: appointment.status,
				...c2pState
			});
		}
		/* Proveedor: solo sección hacia el cliente; la UI de dueño sigue el mismo shape que antes */
		if (isProvider && !isOwner) {
			return res.status(200).json({
				appointmentStatus: appointment.status,
				canReview: p2cState.canReviewClient,
				hasReview: p2cState.hasClientReview,
				canEdit: p2cState.canEditClient,
				reviewId: p2cState.clientReviewId,
				review: p2cState.clientReview,
				canReviewClient: p2cState.canReviewClient,
				hasClientReview: p2cState.hasClientReview,
				canEditClient: p2cState.canEditClient,
				clientReviewId: p2cState.clientReviewId,
				clientReview: p2cState.clientReview
			});
		}
		/* (raro) misma persona */
		return res.status(200).json({
			appointmentStatus: appointment.status,
			...c2pState,
			...p2cState
		});
	} catch (err) {
		next(err);
	}
}

/**
 * POST /api/appointments/:id/reviews
 * Body: { rating, observation? } el rol define la dirección (dueño → proveedor, paseador/cuidador → cliente).
 */
async function createAppointmentReview(req, res, next) {
	try {
		const id = req.params.id;
		if (!mongoose.isValidObjectId(id)) {
			return res.status(400).json({ message: 'Id de cita inválido' });
		}
		const ratingP = parseRating(req.body);
		if (ratingP.error) {
			return res.status(400).json({ message: ratingP.error });
		}
		const obsP = parseObservation(req.body);
		if (obsP.error) {
			return res.status(400).json({ message: obsP.error });
		}
		const r = ratingP.value;
		const observation = obsP.value;

		const appointment = await Appointment.findById(id);
		if (!appointment) {
			return res.status(404).json({ message: 'Cita no encontrada' });
		}
		if (appointment.status !== 'completed') {
			return res.status(400).json({ message: 'Solo se puede reseñar una cita finalizada' });
		}

		const userId = String(req.user.id);
		const isOwner = String(appointment.ownerId) === userId;
		const isProvider = String(appointment.providerId) === userId;
		if (!isOwner && !isProvider) {
			return res.status(403).json({ message: 'No participas en esta cita' });
		}

		const provUser = await User.findById(appointment.providerId).select('providerType').lean();
		const providerType = provUser?.providerType;

		let direction;
		if (isOwner && !isProvider) {
			if (req.user.role !== 'dueno') {
				return res.status(403).json({ message: 'Solo el cliente (dueño) puede publicar esta reseña' });
			}
			direction = REVIEW_DIRECTIONS.CLIENT_TO_PROVIDER;
		} else if (isProvider && !isOwner) {
			if (!['paseador', 'cuidador'].includes(String(providerType || ''))) {
				return res
					.status(400)
					.json({ message: 'Sólo paseadores o cuidadores pueden reseñar al dueño' });
			}
			direction = REVIEW_DIRECTIONS.PROVIDER_TO_CLIENT;
		} else {
			return res.status(400).json({ message: 'No se puede determinar el tipo de reseña' });
		}

		const existing = await Review.findOne({ appointmentId: id, direction });
		if (existing) {
			return res.status(409).json({ message: 'Ya existe una reseña tuya de este tipo para esta cita' });
		}

		const doc = await Review.create({
			appointmentId: id,
			direction,
			providerId: appointment.providerId,
			ownerId: appointment.ownerId,
			rating: r,
			observation,
			comment: ''
		});

		if (direction === REVIEW_DIRECTIONS.CLIENT_TO_PROVIDER) {
			await syncProviderRatingToUser(appointment.providerId);
		}

		return res.status(201).json({
			message: 'Reseña registrada',
			review: {
				id: String(doc._id),
				rating: doc.rating,
				observation: getObservationText(doc),
				comment: getObservationText(doc)
			}
		});
	} catch (err) {
		if (err.code === 11000) {
			return res.status(409).json({ message: 'Ya existe reseña para esta cita' });
		}
		next(err);
	}
}

module.exports = {
	getAppointmentReviewEligibility,
	createAppointmentReview
};
