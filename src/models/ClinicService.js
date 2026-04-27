'use strict';

const mongoose = require('mongoose');

const clinicServiceSchema = new mongoose.Schema(
	{
		providerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		displayName: {
			type: String,
			required: true,
			trim: true,
			maxlength: 120
		},
		slotDurationMinutes: {
			type: Number,
			required: true,
			min: 15,
			max: 180,
			default: 30
		},
		priceClp: {
			type: Number,
			min: 0,
			default: undefined
		},
		currency: {
			type: String,
			trim: true,
			default: 'CLP',
			maxlength: 8
		},
		active: {
			type: Boolean,
			default: true,
			index: true
		}
	},
	{ timestamps: true }
);

clinicServiceSchema.index({ providerId: 1, displayName: 1 });

module.exports = mongoose.model('ClinicService', clinicServiceSchema);
