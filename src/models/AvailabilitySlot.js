'use strict';

const mongoose = require('mongoose');

const SLOT_STATUSES = ['available', 'blocked'];

const availabilitySlotSchema = new mongoose.Schema(
	{
		providerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		/** Línea de atención (agenda personal); obligatorio en veterinarias con datos migrados. */
		clinicServiceId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'ClinicService',
			index: true
		},
		startAt: {
			type: Date,
			required: true,
			index: true
		},
		endAt: {
			type: Date,
			required: true
		},
		status: {
			type: String,
			enum: SLOT_STATUSES,
			default: 'available',
			index: true
		}
	},
	{
		timestamps: true
	}
);

/** Varias líneas bajo el mismo providerId pueden tener el mismo instante (distinta agenda). */
availabilitySlotSchema.index({ providerId: 1, clinicServiceId: 1, startAt: 1 }, { unique: true });

module.exports = mongoose.model('AvailabilitySlot', availabilitySlotSchema);
module.exports.SLOT_STATUSES = SLOT_STATUSES;
