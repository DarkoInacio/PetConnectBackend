'use strict';

const mongoose = require('mongoose');

const APPOINTMENT_STATUSES = [
	'pending_confirmation',
	'confirmed',
	'cancelled_by_owner',
	'cancelled_by_provider',
	'completed',
	'no_show'
];

const appointmentSchema = new mongoose.Schema(
	{
		ownerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		providerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		slotId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'AvailabilitySlot',
			required: true,
			unique: true,
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
		pet: {
			name: {
				type: String,
				trim: true
			},
			species: {
				type: String,
				trim: true
			}
		},
		reason: {
			type: String,
			trim: true,
			maxlength: 500
		},
		status: {
			type: String,
			enum: APPOINTMENT_STATUSES,
			default: 'confirmed',
			index: true
		},
		reminder24hSentAt: {
			type: Date,
			default: null
		},
		cancelledAt: Date,
		cancellationReason: {
			type: String,
			trim: true,
			maxlength: 200
		}
	},
	{
		timestamps: true
	}
);

module.exports = mongoose.model('Appointment', appointmentSchema);
module.exports.APPOINTMENT_STATUSES = APPOINTMENT_STATUSES;
