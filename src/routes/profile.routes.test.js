'use strict';

const { api } = require('../../test/helpers/request');
const { createOwner, buildAuthHeader } = require('../../test/helpers/factories');

describe('GET /api/profile/me', () => {
	it('responde 401 sin token', async () => {
		const res = await api().get('/api/profile/me');
		expect(res.status).toBe(401);
	});
});

describe('PUT /api/profile/me', () => {
	it('responde 401 sin token', async () => {
		const res = await api().put('/api/profile/me').send({ name: 'Nuevo' });
		expect(res.status).toBe(401);
	});

	it('actualiza nombre y teléfono (caso feliz)', async () => {
		const owner = await createOwner({ name: 'Viejo' });
		const res = await api()
			.put('/api/profile/me')
			.set(buildAuthHeader(owner))
			.send({ name: 'Actualizado', phone: '+56912345678' });

		expect(res.status).toBe(200);
		expect(res.body.user.name).toBe('Actualizado');
	});

	it('responde 400 si intenta cambiar email', async () => {
		const owner = await createOwner();
		const res = await api()
			.put('/api/profile/me')
			.set(buildAuthHeader(owner))
			.send({ email: 'hack@test.com' });

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/email/i);
	});
});
