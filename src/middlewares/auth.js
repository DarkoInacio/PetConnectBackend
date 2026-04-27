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
		const rawId = decoded.id ?? decoded.sub ?? decoded.userId;
		// Cargar usuario para asegurar que existe y no está eliminado en el futuro
		const user = await User.findById(rawId).select('_id role email');
		if (!user) {
			return res.status(401).json({ message: 'Usuario no válido' });
		}
		req.user = { id: user._id.toString(), role: user.role, email: user.email };
		next();
	} catch (error) {
		return res.status(401).json({ message: 'Token inválido o expirado' });
	}
}

module.exports = authMiddleware;