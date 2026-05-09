'use strict';

function authorizeRoles(...allowedRoles) {
	return (req, res, next) => {
		if (!req.user) {
			return res.status(401).json({ message: 'No autenticado' });
		}
		const userRole = req.user.role;
		const ok = allowedRoles.some((role) => {
			if (role === 'administrador' && userRole === 'admin') return true;
			return userRole === role;
		});
		if (!ok) {
			return res.status(403).json({ message: 'No autorizado' });
		}
		next();
	};
}

module.exports = { authorizeRoles };