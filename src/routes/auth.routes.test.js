'use strict';

const crypto = require('crypto');
const User = require('../models/User');
const { api } = require('../../test/helpers/request');
const {
	DEFAULT_PASSWORD,
	createOwner,
	createProvider,
	buildAuthHeader
} = require('../../test/helpers/factories');

describe('POST /api/auth/register', () => {
	it('registra un dueño y devuelve token (caso feliz)', async () => {
		const res = await api().post('/api/auth/register').send({
			name: 'Ana',
			lastName: 'Dueña',
			email: 'ana.dueña@test.com',
			password: DEFAULT_PASSWORD
		});

		expect(res.status).toBe(201);
		expect(res.body.token).toBeDefined();
		expect(res.body.user).toMatchObject({
			email: 'ana.dueña@test.com',
			role: 'dueno'
		});

		const stored = await User.findOne({ email: 'ana.dueña@test.com' }).select('+password');
		expect(stored).not.toBeNull();
		const valid = await stored.comparePassword(DEFAULT_PASSWORD);
		expect(valid).toBe(true);
	});

	it('responde 400 si faltan campos obligatorios', async () => {
		const res = await api().post('/api/auth/register').send({ email: 'solo@test.com' });

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/obligatorios/i);
	});

	it('responde 400 si el rol es inválido', async () => {
		const res = await api().post('/api/auth/register').send({
			name: 'X',
			lastName: 'Y',
			email: 'rol@test.com',
			password: DEFAULT_PASSWORD,
			role: 'superadmin'
		});

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/rol inválido/i);
	});

	it('responde 400 si se intenta registrar proveedor por esta ruta', async () => {
		const res = await api().post('/api/auth/register').send({
			name: 'Vet',
			lastName: 'Test',
			email: 'vet@test.com',
			password: DEFAULT_PASSWORD,
			role: 'proveedor'
		});

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/register-provider/i);
	});

	it('responde 403 si se intenta crear admin por esta ruta', async () => {
		const res = await api().post('/api/auth/register').send({
			name: 'Admin',
			lastName: 'Hack',
			email: 'admin.hack@test.com',
			password: DEFAULT_PASSWORD,
			role: 'admin'
		});

		expect(res.status).toBe(403);
		expect(res.body.message).toMatch(/administrador/i);
	});

	it('responde 409 si el correo ya existe', async () => {
		await createOwner({ email: 'dup@test.com' });

		const res = await api().post('/api/auth/register').send({
			name: 'Otro',
			lastName: 'User',
			email: 'dup@test.com',
			password: DEFAULT_PASSWORD
		});

		expect(res.status).toBe(409);
		expect(res.body.message).toMatch(/registrado/i);
	});
});

describe('POST /api/auth/login', () => {
	it('autentica con credenciales válidas (caso feliz)', async () => {
		const owner = await createOwner({ email: 'login.ok@test.com' });

		const res = await api().post('/api/auth/login').send({
			email: owner.email,
			password: DEFAULT_PASSWORD
		});

		expect(res.status).toBe(200);
		expect(res.body.token).toBeDefined();
		expect(res.body.user).toMatchObject({
			id: owner._id.toString(),
			email: owner.email,
			role: 'dueno'
		});
	});

	it('responde 400 si faltan email o password', async () => {
		const res = await api().post('/api/auth/login').send({ email: 'x@test.com' });

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/obligatorios/i);
	});

	it('responde 400 con credenciales inválidas (usuario inexistente)', async () => {
		const res = await api().post('/api/auth/login').send({
			email: 'noexiste@test.com',
			password: DEFAULT_PASSWORD
		});

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/inválidas/i);
	});

	it('responde 400 con contraseña incorrecta', async () => {
		await createOwner({ email: 'badpass@test.com' });

		const res = await api().post('/api/auth/login').send({
			email: 'badpass@test.com',
			password: 'WrongPass99!'
		});

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/inválidas/i);
	});
});

describe('POST /api/auth/forgot-password', () => {
	it('responde 400 si falta el email', async () => {
		const res = await api().post('/api/auth/forgot-password').send({});

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/obligatorio/i);
	});

	it('responde 200 genérico si el correo no existe (sin enumeración)', async () => {
		const res = await api().post('/api/auth/forgot-password').send({
			email: 'fantasma@test.com'
		});

		expect(res.status).toBe(200);
		expect(res.body.message).toMatch(/si el correo existe/i);
	});

	it('genera token de reset para usuario existente en modo test', async () => {
		const owner = await createOwner({ email: 'reset.me@test.com' });

		const res = await api().post('/api/auth/forgot-password').send({
			email: owner.email
		});

		expect(res.status).toBe(200);
		expect(res.body.resetUrl).toMatch(/reset-password\?token=/);

		const updated = await User.findById(owner._id).select('+passwordResetToken +passwordResetExpires');
		expect(updated.passwordResetToken).toBeDefined();
		expect(updated.passwordResetExpires).toBeInstanceOf(Date);
	});
});

describe('POST /api/auth/reset-password', () => {
	it('responde 400 si faltan campos obligatorios', async () => {
		const res = await api().post('/api/auth/reset-password').send({
			email: 'x@test.com',
			token: 'abc'
		});

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/obligatorios/i);
	});

	it('responde 400 con token inválido o expirado', async () => {
		const owner = await createOwner({ email: 'badtoken@test.com' });

		const res = await api().post('/api/auth/reset-password').send({
			email: owner.email,
			token: 'token-falso',
			newPassword: 'NuevaPass99!'
		});

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/inválido|expirado/i);
	});

	it('actualiza la contraseña con token válido (caso feliz)', async () => {
		const owner = await createOwner({ email: 'reset.ok@test.com' });
		const rawToken = crypto.randomBytes(32).toString('hex');
		const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

		owner.passwordResetToken = tokenHash;
		owner.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
		await owner.save();

		const newPassword = 'NuevaPass99!';
		const res = await api().post('/api/auth/reset-password').send({
			email: owner.email,
			token: rawToken,
			newPassword
		});

		expect(res.status).toBe(200);
		expect(res.body.message).toMatch(/actualizada/i);

		const updated = await User.findOne({ email: owner.email }).select('+password');
		const valid = await updated.comparePassword(newPassword);
		expect(valid).toBe(true);
	});
});

describe('Autorización en rutas protegidas (middleware auth + roles)', () => {
	it('GET /api/profile/me responde 401 sin token', async () => {
		const res = await api().get('/api/profile/me');

		expect(res.status).toBe(401);
		expect(res.body.message).toMatch(/no autenticado/i);
	});

	it('GET /api/profile/me responde 401 con token inválido', async () => {
		const res = await api()
			.get('/api/profile/me')
			.set('Authorization', 'Bearer token.invalido');

		expect(res.status).toBe(401);
		expect(res.body.message).toMatch(/inválido|expirado/i);
	});

	it('GET /api/profile/me responde 200 con token válido', async () => {
		const owner = await createOwner({ email: 'profile.me@test.com', name: 'Perfil' });

		const res = await api().get('/api/profile/me').set(buildAuthHeader(owner));

		expect(res.status).toBe(200);
		expect(res.body.user.email).toBe(owner.email);
	});

	it('POST /api/auth/upgrade-to-provider responde 401 sin token', async () => {
		const res = await api().post('/api/auth/upgrade-to-provider').send({});

		expect(res.status).toBe(401);
	});

	it('POST /api/auth/upgrade-to-provider responde 403 si el rol no es dueño', async () => {
		const provider = await createProvider({ email: 'vet.noupgrade@test.com' });

		const res = await api()
			.post('/api/auth/upgrade-to-provider')
			.set(buildAuthHeader(provider))
			.send({ providerType: 'veterinaria' });

		expect(res.status).toBe(403);
		expect(res.body.message).toMatch(/no autorizado/i);
	});
});

describe('GET /health', () => {
	it('responde 200 sin autenticación', async () => {
		const res = await api().get('/health');

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ status: 'ok' });
	});
});
