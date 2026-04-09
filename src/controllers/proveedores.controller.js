'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');

const PRIVATE_PROFILE_KEYS = new Set(['rejectionReason', 'reviewedAt', 'reviewedBy']);

function toPublicProviderProfile(pp) {
	if (!pp) return null;
	const raw = pp.toObject ? pp.toObject() : { ...pp };
	const out = {};
	for (const key of Object.keys(raw)) {
		if (!PRIVATE_PROFILE_KEYS.has(key)) {
			out[key] = raw[key];
		}
	}
	return out;
}

/**
 * GET /api/proveedores/:id/perfil
 */
async function getProviderPublicProfile(req, res, next) {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id)) {
			return res.status(400).json({ message: 'Id de proveedor inválido' });
		}
		const user = await User.findById(id).select('role status providerProfile');
		if (!user || user.role !== 'proveedor' || user.status !== 'aprobado') {
			return res.status(404).json({ message: 'Proveedor no encontrado' });
		}
		return res.status(200).json({ perfil: toPublicProviderProfile(user.providerProfile) });
	} catch (err) {
		next(err);
	}
}

module.exports = {
	getProviderPublicProfile,
	toPublicProviderProfile
};
