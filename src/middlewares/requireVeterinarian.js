'use strict';

const User = require('../models/User');
const { isProveedorAprobado, normalizeAccountStatus } = require('../utils/providerEligibility');

async function requireVeterinarian(req, res, next) {
	try {
		if (req.user.role !== 'proveedor') {
			return res.status(403).json({ message: 'Solo veterinarias pueden acceder' });
		}
		const user = await User.findById(req.user.id).select('providerType status');
		if (!user || user.providerType !== 'veterinaria') {
			return res.status(403).json({ message: 'Solo cuentas de veterinaria aprobadas pueden acceder' });
		}
		if (!isProveedorAprobado(user)) {
			const norm = normalizeAccountStatus(user.status);
			const hint =
				norm === 'en_revision'
					? ' Tu perfil aún está en revisión.'
					: ` Estado actual: "${user.status ?? 'sin estado'}".`;
			return res.status(403).json({
				message: `Solo cuentas de veterinaria aprobadas pueden acceder.${hint}`
			});
		}
		next();
	} catch (err) {
		next(err);
	}
}

module.exports = requireVeterinarian;
