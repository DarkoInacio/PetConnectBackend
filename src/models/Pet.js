'use strict';

const mongoose = require('mongoose');

const PET_SPECIES = ['perro', 'gato', 'ave', 'roedor', 'otro'];
const PET_SEX = ['macho', 'hembra', 'desconocido'];
const PET_STATUS = ['active', 'deceased'];

const petSchema = new mongoose.Schema(
	{
		ownerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		name: { type: String, required: true, trim: true },
		species: {
			type: String,
			required: true,
			enum: PET_SPECIES
		},
		breed: { type: String, trim: true, default: '' },
		birthDate: { type: Date, default: null },
		sex: {
			type: String,
			required: true,
			enum: PET_SEX
		},
		color: { type: String, trim: true, default: '' },
		/** Nombre de archivo bajo uploads/pets/ (sin servir por URL pública directa) */
		photoFilename: { type: String, default: null },
		status: {
			type: String,
			enum: PET_STATUS,
			default: 'active',
			index: true
		},
		deceasedAt: { type: Date, default: null }
	},
	{ timestamps: true }
);

petSchema.index({ ownerId: 1, status: 1 });

module.exports = mongoose.model('Pet', petSchema);
module.exports.PET_SPECIES = PET_SPECIES;
module.exports.PET_SEX = PET_SEX;
module.exports.PET_STATUS = PET_STATUS;
