'use strict';

const User = require('../models/User');

async function requireVeterinarian(req, res, next) {
	try {
		const roles = Array.isArray(req.user?.roles) && req.user.roles.length > 0 ? req.user.roles : [req.user?.role];
		if (!roles.includes('proveedor')) {
			return res.status(403).json({ message: 'Solo veterinarias pueden acceder' });
		}
		const user = await User.findById(req.user.id).select('providerType status');
		if (!user || user.status !== 'aprobado' || user.providerType !== 'veterinaria') {
			return res.status(403).json({ message: 'Solo cuentas de veterinaria aprobadas pueden acceder' });
		}
		next();
	} catch (err) {
		next(err);
	}
}

module.exports = requireVeterinarian;
