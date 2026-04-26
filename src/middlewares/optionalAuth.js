'use strict';

const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');

async function optionalAuth(req, res, next) {
	try {
		const header = req.headers.authorization || '';
		const token = header.startsWith('Bearer ') ? header.slice(7) : null;
		if (!token) return next();

		const decoded = verifyToken(token);
		const user = await User.findById(decoded.id).select('_id role email roles status providerType');
		if (!user) return next();

		const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
		req.user = {
			id: user._id.toString(),
			role: user.role,
			roles,
			email: user.email,
			status: user.status,
			providerType: user.providerType
		};
		return next();
	} catch {
		// Token inválido -> lo tratamos como visitante
		return next();
	}
}

module.exports = optionalAuth;

