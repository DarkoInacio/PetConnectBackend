'use strict';

const mongoose = require('mongoose');

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
		species: { type: String, required: true, trim: true },
		breed: { type: String, trim: true, default: '' },
		birthDate: { type: Date },
		sex: {
			type: String,
			enum: ['macho', 'hembra', 'desconocido'],
			default: 'desconocido'
		},
		color: { type: String, trim: true },
		/** Ruta relativa bajo /uploads (ej. pets/nombre-123.jpg) */
		foto: { type: String, trim: true },
		status: {
			type: String,
			enum: PET_STATUS,
			default: 'active'
		}
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Pet', petSchema);
module.exports.PET_STATUS = PET_STATUS;
