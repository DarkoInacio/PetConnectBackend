'use strict';

const mongoose = require('mongoose');

const ENCOUNTER_TYPES = ['consulta', 'vacuna', 'otro'];

const medicationSchema = new mongoose.Schema(
	{
		nombre: { type: String, trim: true, required: true },
		dosis: { type: String, trim: true, default: '' },
		frecuencia: { type: String, trim: true, default: '' },
		duracion: { type: String, trim: true, default: '' }
	},
	{ _id: false }
);

const attachmentSchema = new mongoose.Schema(
	{
		filename: { type: String, required: true },
		originalName: { type: String, trim: true, default: '' },
		mime: { type: String, required: true },
		size: { type: Number, required: true }
	},
	{ _id: false }
);

const proximoControlSchema = new mongoose.Schema(
	{
		fecha: { type: Date },
		motivo: { type: String, trim: true, default: '' }
	},
	{ _id: false }
);

const retractionSchema = new mongoose.Schema(
	{
		text: { type: String, required: true, trim: true, maxlength: 4000 },
		createdAt: { type: Date, default: Date.now },
		providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
		signerName: { type: String, trim: true, default: '' }
	},
	{ _id: true }
);

const clinicalEncounterSchema = new mongoose.Schema(
	{
		petId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true, index: true },
		providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
		appointmentId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Appointment',
			required: true,
			unique: true,
			index: true
		},
		type: {
			type: String,
			enum: ENCOUNTER_TYPES,
			default: 'consulta',
			index: true
		},
		occurredAt: { type: Date, required: true, index: true },
		motivo: { type: String, trim: true, required: true },
		diagnostico: { type: String, trim: true, default: '' },
		tratamiento: { type: String, trim: true, default: '' },
		medications: { type: [medicationSchema], default: [] },
		observaciones: { type: String, trim: true, default: '' },
		proximoControl: { type: proximoControlSchema, default: undefined },
		attachments: { type: [attachmentSchema], default: [] },
		signedAt: { type: Date, required: true },
		signedByName: { type: String, required: true, trim: true },
		retractionComments: { type: [retractionSchema], default: [] }
	},
	{ timestamps: true }
);

clinicalEncounterSchema.index({ petId: 1, occurredAt: -1 });

module.exports = mongoose.model('ClinicalEncounter', clinicalEncounterSchema);
module.exports.ENCOUNTER_TYPES = ENCOUNTER_TYPES;
