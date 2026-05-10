'use strict';

const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');

async function authMiddleware(req, res, next) {
	try {
		const header = req.headers.authorization || '';
		const token = header.startsWith('Bearer ') ? header.slice(7) : null;
		if (!token) {
			return res.status(401).json({ message: 'No autenticado' });
		}
		const decoded = verifyToken(token);
		// Cargar usuario para asegurar que existe y no está eliminado en el futuro
		const user = await User.findById(decoded.id).select('_id role email roles status providerType');
		if (!user) {
			return res.status(401).json({ message: 'Usuario no válido' });
		}
		const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
		req.user = {
			id: user._id.toString(),
			role: user.role,
			roles,
			email: user.email,
			status: user.status,
			providerType: user.providerType
		};
		next();
	} catch (error) {
		return res.status(401).json({ message: 'Token inválido o expirado' });
	}
}

module.exports = authMiddleware;