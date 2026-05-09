'use strict';

const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');

/**
 * Auth opcional: si hay Bearer token válido, setea req.user; si no, continúa sin error.
 */
async function optionalAuth(req, res, next) {
	try {
		const header = req.headers.authorization || '';
		const token = header.startsWith('Bearer ') ? header.slice(7) : null;
		if (!token) return next();

		const decoded = verifyToken(token);
		const user = await User.findById(decoded.id).select('_id role email name');
		if (!user) return next();

		req.user = {
			id: user._id.toString(),
			role: user.role,
			email: user.email,
			name: user.name
		};
		return next();
	} catch {
		return next();
	}
}

module.exports = optionalAuth;

