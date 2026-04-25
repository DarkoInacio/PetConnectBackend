'use strict';

const mongoose = require('mongoose');

const REVIEW_DIRECTIONS = Object.freeze({
	CLIENT_TO_PROVIDER: 'client_to_provider',
	PROVIDER_TO_CLIENT: 'provider_to_client'
});

const reviewSchema = new mongoose.Schema(
	{
		providerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		/** Dueño (cliente) involucrado en la cita. */
		ownerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		/** Si existe, la reseña queda fijada a una cita concreta. */
		appointmentId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Appointment',
			sparse: true,
			index: true
		},
		direction: {
			type: String,
			enum: [REVIEW_DIRECTIONS.CLIENT_TO_PROVIDER, REVIEW_DIRECTIONS.PROVIDER_TO_CLIENT],
			default: REVIEW_DIRECTIONS.CLIENT_TO_PROVIDER
		},
		rating: {
			type: Number,
			required: true,
			min: 1,
			max: 5
		},
		/** Observación opcional (máx. 200 caracteres). Sustituye a `comment` en integraciones nuevas. */
		observation: {
			type: String,
			trim: true,
			maxlength: 200,
			default: ''
		},
		/** @deprecated Reservado por datos anteriores; leer vía getObservation() en servicios. */
		comment: {
			type: String,
			trim: true,
			maxlength: 2000,
			default: ''
		}
	},
	{
		timestamps: true
	}
);

reviewSchema.index(
	{ appointmentId: 1, direction: 1 },
	{ unique: true, partialFilterExpression: { appointmentId: { $exists: true, $ne: null } } }
);
reviewSchema.index({ providerId: 1, direction: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
module.exports.REVIEW_DIRECTIONS = REVIEW_DIRECTIONS;
