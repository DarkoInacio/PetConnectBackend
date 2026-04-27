'use strict';

function authorizeRoles(...allowedRoles) {
	return (req, res, next) => {
		if (!req.user) {
			return res.status(401).json({ message: 'No autenticado' });
		}
		const role = String(req.user.role || '').trim();
		if (!allowedRoles.includes(role)) {
			return res.status(403).json({
				message: `No autorizado: esta ruta requiere rol ${allowedRoles.join(' o ')}. Tu sesión tiene rol "${role || 'desconocido'}". Si acabas de registrar una clínica, usa ese usuario o cierra sesión y vuelve a entrar.`
			});
		}
		next();
	};
}

module.exports = { authorizeRoles };