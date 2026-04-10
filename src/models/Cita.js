'use strict';

const mongoose = require('mongoose');

const mascotaEmbeddedSchema = new mongoose.Schema(
	{
		nombre: { type: String, required: true, trim: true },
		especie: { type: String, required: true, trim: true }
	},
	{ _id: false }
);

const CITA_ESTADOS = ['pendiente', 'confirmada', 'completada', 'cancelada'];

const citaSchema = new mongoose.Schema(
	{
		dueno: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		proveedor: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		mascota: {
			type: mascotaEmbeddedSchema,
			required: true
		},
		servicio: {
			type: String,
			required: true,
			trim: true
		},
		fecha: {
			type: Date,
			required: true
		},
		estado: {
			type: String,
			enum: CITA_ESTADOS,
			default: 'pendiente'
		},
		notas: {
			type: String,
			trim: true
		},
		diagnostico: {
			type: String,
			trim: true
		}
	},
	{
		timestamps: true
	}
);

module.exports = mongoose.model('Cita', citaSchema);
module.exports.CITA_ESTADOS = CITA_ESTADOS;
