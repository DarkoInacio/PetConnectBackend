'use strict';

const jwt = require('jsonwebtoken');

function signToken(payload, options = {}) {
	const secret = process.env.JWT_SECRET;
	const expiresIn = options.expiresIn || process.env.JWT_EXPIRES_IN || '7d';
	if (!secret) {
		throw new Error('JWT_SECRET no está definido en variables de entorno.');
	}
	return jwt.sign(payload, secret, { expiresIn });
}

function verifyToken(token) {
	const secret = process.env.JWT_SECRET;
	if (!secret) {
		throw new Error('JWT_SECRET no está definido en variables de entorno.');
	}
	return jwt.verify(token, secret);
}

module.exports = { signToken, verifyToken };