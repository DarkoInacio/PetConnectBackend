'use strict';

/** En BD el rol técnico es `admin`; en rutas se usa también el alias `administrador` (HU). */
function expandAdminAliases(roles) {
	const set = new Set(roles);
	if (set.has('admin') || set.has('administrador')) {
		set.add('admin');
		set.add('administrador');
	}
	return set;
}

function authorizeRoles(...allowedRoles) {
	return (req, res, next) => {
		if (!req.user) {
			return res.status(401).json({ message: 'No autenticado' });
		}
		const effective = req.user.roles && req.user.roles.length > 0 ? req.user.roles : [req.user.role];
		const allowedSet = new Set();
		for (const r of allowedRoles) {
			allowedSet.add(r);
			if (r === 'admin' || r === 'administrador') {
				allowedSet.add('admin');
				allowedSet.add('administrador');
			}
		}
		const effectiveSet = expandAdminAliases(effective);
		if (![...effectiveSet].some((r) => allowedSet.has(r))) {
			return res.status(403).json({ message: 'No autorizado' });
		}
		next();
	};
}

module.exports = { authorizeRoles };