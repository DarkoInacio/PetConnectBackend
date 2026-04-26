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

const BOOKING_SOURCES = ['availability_slot', 'walker_request'];

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
		/** Línea de atención cuando aplica (agenda veterinaria por servicio). */
		clinicServiceId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'ClinicService',
			sparse: true,
			index: true
		},
		/** Obligatorio solo si bookingSource === availability_slot; walker_request no lleva slot. */
		slotId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'AvailabilitySlot'
		},
		/** Reserva por franja de agenda o solicitud paseador/cuidador */
		bookingSource: {
			type: String,
			enum: BOOKING_SOURCES,
			default: 'availability_slot',
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
		petId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Pet',
			sparse: true,
			index: true
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

appointmentSchema.pre('validate', function (next) {
	const src = this.bookingSource || 'availability_slot';
	if (src === 'availability_slot' && !this.slotId) {
		return next(new Error('slotId es obligatorio cuando bookingSource es availability_slot'));
	}
	next();
});

/** Unicidad solo cuando hay slot real; varias solicitudes walker_request sin slot no colisionan (E11000). */
appointmentSchema.index(
	{ slotId: 1 },
	{
		unique: true,
		partialFilterExpression: { slotId: { $type: 'objectId' } }
	}
);

module.exports = mongoose.model('Appointment', appointmentSchema);
module.exports.APPOINTMENT_STATUSES = APPOINTMENT_STATUSES;
module.exports.BOOKING_SOURCES = BOOKING_SOURCES;
