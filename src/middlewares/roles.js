'use strict';

function authorizeRoles(...allowedRoles) {
	return (req, res, next) => {
		if (!req.user) {
			return res.status(401).json({ message: 'No autenticado' });
		}
		const effective = req.user.roles && req.user.roles.length > 0 ? req.user.roles : [req.user.role];
		if (!allowedRoles.some((r) => effective.includes(r))) {
			return res.status(403).json({ message: 'No autorizado' });
		}
		next();
	};
}

module.exports = { authorizeRoles };