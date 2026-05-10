'use strict';

const mongoose = require('mongoose');

/**
 * Línea de atención dentro de una clínica (mismo User proveedor veterinario).
 * La agenda genera franjas por `slotDurationMinutes` y por cada servicio activo.
 */
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
			trim: true,
			maxlength: 120,
			required: true
		},
		kind: {
			type: String,
			trim: true,
			maxlength: 80,
			default: 'consulta'
		},
		/** Duración de cada franja y paso al generar (15–180). Veterinaria. */
		slotDurationMinutes: {
			type: Number,
			default: 30,
			min: 15,
			max: 180
		},
		/**
		 * Referencia o tarifa pública. En veterinaria suele ocultarse en la UI; paseo/cuidado reforzar.
		 * null = sin precio mostrable / a convenir
		 */
		priceClp: {
			type: Number,
			min: 0,
			default: null
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
