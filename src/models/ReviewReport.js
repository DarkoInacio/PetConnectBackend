'use strict';

const mongoose = require('mongoose');

const REPORT_REASONS = ['contenido_falso', 'lenguaje_ofensivo', 'spam', 'informacion_personal', 'otro'];
const REPORT_STATES = ['pendiente', 'revisada_resena_mantenida', 'revisada_resena_eliminada', 'revisada_autor_suspendido'];

const reviewReportSchema = new mongoose.Schema(
	{
		reviewId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Review',
			required: true,
			index: true
		},
		reporterId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		reason: {
			type: String,
			enum: REPORT_REASONS,
			required: true
		},
		otherText: {
			type: String,
			trim: true,
			maxlength: 300,
			default: ''
		},
		status: {
			type: String,
			enum: REPORT_STATES,
			default: 'pendiente',
			index: true
		},
		adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
		adminDecidedAt: { type: Date },
		adminNote: { type: String, trim: true, maxlength: 2000, default: '' }
	},
	{ timestamps: true }
);

reviewReportSchema.index({ reviewId: 1, reporterId: 1 }, { unique: true });

const ReviewReport = mongoose.model('ReviewReport', reviewReportSchema);
ReviewReport.REPORT_REASONS = REPORT_REASONS;
ReviewReport.REPORT_STATES = REPORT_STATES;
module.exports = ReviewReport;
