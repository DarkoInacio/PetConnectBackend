'use strict';

const mongoose = require('mongoose');

/**
 * Reseña ligada a una cita completada (appointmentId único).
 * Reseñas heredades sin cita: appointmentId null (sin índice único vacío; sparse evita colisión con null en Mongo 4+).
 * Campo removedByAdmin: false para contar en promedio; true = oculta en listados públicos.
 */
const reviewSchema = new mongoose.Schema(
	{
		providerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		ownerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		appointmentId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Appointment',
			sparse: true,
			unique: true
		},
		rating: {
			type: Number,
			required: true,
			min: 1,
			max: 5
		},
		comment: {
			type: String,
			trim: true,
			maxlength: 500,
			default: ''
		},
		/** Respuesta pública del proveedor (máx 500 caracteres en validación de controlador) */
		providerReply: {
			text: { type: String, trim: true, maxlength: 500, default: '' },
			createdAt: { type: Date },
			updatedAt: { type: Date }
		},
		removedByAdmin: {
			type: Boolean,
			default: false,
			index: true
		},
		removedAt: { type: Date }
	},
	{
		timestamps: true
	}
);

reviewSchema.index({ providerId: 1, createdAt: -1 });
reviewSchema.index({ providerId: 1, ownerId: 1 });

const Review = mongoose.model('Review', reviewSchema);
module.exports = Review;
module.exports.REVIEW_COMMENT_MAX = 500;
module.exports.REVIEW_REPLY_MAX = 500;
