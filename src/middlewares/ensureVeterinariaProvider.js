'use strict';

const User = require('../models/User');

/**
 * JWT + authorizeRoles('proveedor') debe ir antes en la cadena.
 */
async function ensureVeterinariaProvider(req, res, next) {
	try {
		const u = await User.findById(req.user.id).select('role providerType').lean();
		if (!u || u.role !== 'proveedor') {
			return res.status(403).json({ message: 'Solo cuentas de proveedor pueden acceder a este recurso.' });
		}
		if (u.providerType !== 'veterinaria') {
			return res.status(403).json({ message: 'Solo cuentas de veterinarias pueden usar este recurso.' });
		}
		next();
	} catch (error) {
		next(error);
	}
}

module.exports = ensureVeterinariaProvider;
