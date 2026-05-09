'use strict';

const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema(
	{
		name: { type: String, trim: true },
		dose: { type: String, trim: true }
	},
	{ _id: false }
);

const attachmentSchema = new mongoose.Schema(
	{
		path: { type: String, required: true },
		originalName: { type: String, trim: true }
	},
	{ _id: false }
);

const clinicalEncounterSchema = new mongoose.Schema(
	{
		petId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Pet',
			required: true,
			index: true
		},
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
			sparse: true
		},
		type: { type: String, trim: true, default: 'consulta' },
		motivo: { type: String, required: true, trim: true },
		diagnostico: { type: String, trim: true },
		tratamiento: { type: String, trim: true },
		observaciones: { type: String, trim: true },
		occurredAt: { type: Date, default: Date.now, index: true },
		medications: [medicationSchema],
		proximoControl: {
			fecha: { type: Date },
			motivo: { type: String, trim: true }
		},
		attachments: [attachmentSchema]
	},
	{ timestamps: true }
);

clinicalEncounterSchema.index({ appointmentId: 1 }, { unique: true, sparse: true });
clinicalEncounterSchema.index({ petId: 1, providerId: 1, occurredAt: -1 });

module.exports = mongoose.model('ClinicalEncounter', clinicalEncounterSchema);
