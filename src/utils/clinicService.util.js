'use strict';

const ClinicService = require('../models/ClinicService');

/**
 * Crea o devuelve la línea "Consulta general" para una clínica sin servicios aún.
 * @param {import('mongoose').Types.ObjectId} providerId
 */
async function ensureDefaultClinicService(providerId) {
	const existing = await ClinicService.findOne({ providerId, active: true }).sort({ createdAt: 1 });
	if (existing) return existing;
	return ClinicService.create({
		providerId,
		displayName: 'Consulta general',
		kind: 'consulta',
		slotDurationMinutes: 30,
		active: true
	});
}

/**
 * @param {import('mongoose').Types.ObjectId} providerId
 */
async function listActiveClinicServices(providerId) {
	return ClinicService.find({ providerId, active: true })
		.sort({ displayName: 1 })
		.lean();
}

module.exports = {
	ensureDefaultClinicService,
	listActiveClinicServices
};
