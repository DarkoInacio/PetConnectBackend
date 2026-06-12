'use strict';

const jwt = require('jsonwebtoken');
const { signToken, verifyToken } = require('./jwt');

describe('jwt utils', () => {
	const originalSecret = process.env.JWT_SECRET;

	beforeEach(() => {
		process.env.JWT_SECRET = 'unit-test-secret';
	});

	afterEach(() => {
		process.env.JWT_SECRET = originalSecret;
	});

	describe('signToken', () => {
		it('genera un JWT válido con el payload indicado', () => {
			const payload = { id: '507f1f77bcf86cd799439011', role: 'dueno' };
			const token = signToken(payload);

			expect(typeof token).toBe('string');
			const decoded = jwt.verify(token, process.env.JWT_SECRET);
			expect(decoded.id).toBe(payload.id);
			expect(decoded.role).toBe(payload.role);
		});

		it('lanza error si JWT_SECRET no está definido', () => {
			delete process.env.JWT_SECRET;
			expect(() => signToken({ id: 'x', role: 'dueno' })).toThrow('JWT_SECRET');
		});
	});

	describe('verifyToken', () => {
		it('decodifica un token firmado con la misma clave', () => {
			const payload = { id: 'abc123', role: 'admin' };
			const token = signToken(payload);
			const decoded = verifyToken(token);

			expect(decoded.id).toBe(payload.id);
			expect(decoded.role).toBe(payload.role);
		});

		it('rechaza un token inválido o manipulado', () => {
			expect(() => verifyToken('token.invalido')).toThrow();
		});

		it('lanza error si JWT_SECRET no está definido', () => {
			const token = signToken({ id: 'x', role: 'dueno' });
			delete process.env.JWT_SECRET;
			expect(() => verifyToken(token)).toThrow('JWT_SECRET');
		});
	});
});
