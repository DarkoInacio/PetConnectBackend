'use strict';

const mongoose = require('mongoose');

/**
 * Recuerda franjas de inicio (startAt) que el proveedor eliminó a mano.
 * Al "generar" no se vuelven a insertar; hay que borrar el registro o usar DELETE /omits.
 */
const agendaSlotOmitSchema = new mongoose.Schema(
	{
		providerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		clinicServiceId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'ClinicService',
			required: true,
			index: true
		},
		/** Mismo instante que AvailabilitySlot.startAt: Date.getTime() en UTC. */
		startAtMs: { type: Number, required: true }
	},
	{ timestamps: true }
);

agendaSlotOmitSchema.index({ providerId: 1, clinicServiceId: 1, startAtMs: 1 }, { unique: true });

module.exports = mongoose.model('AgendaSlotOmit', agendaSlotOmitSchema);
