'use strict';

const { api } = require('../../test/helpers/request');
const { createOwner, createAdmin, createVetProvider, createPendingProvider, buildAuthHeader } = require('../../test/helpers/factories');

describe('GET /api/admin/providers/pending', () => {
	it('responde 401 sin token', async () => {
		const res = await api().get('/api/admin/providers/pending');
		expect(res.status).toBe(401);
	});

	it('responde 403 si no es administrador', async () => {
		const owner = await createOwner();
		const res = await api().get('/api/admin/providers/pending').set(buildAuthHeader(owner));
		expect(res.status).toBe(403);
	});

	it('lista pendientes para admin', async () => {
		const admin = await createAdmin();
		const res = await api().get('/api/admin/providers/pending').set(buildAuthHeader(admin));
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body.items)).toBe(true);
	});
});

describe('GET /api/admin/audit-logs', () => {
	it('responde 403 a dueño', async () => {
		const owner = await createOwner();
		const res = await api().get('/api/admin/audit-logs').set(buildAuthHeader(owner));
		expect(res.status).toBe(403);
	});

	it('responde 200 para admin', async () => {
		const admin = await createAdmin();
		const res = await api().get('/api/admin/audit-logs').set(buildAuthHeader(admin));
		expect(res.status).toBe(200);
	});
});

describe('PATCH /api/admin/providers/:userId/approve', () => {
	it('aprueba un proveedor en revisión', async () => {
		const admin = await createAdmin();
		const pending = await createPendingProvider();

		const res = await api()
			.patch(`/api/admin/providers/${pending._id}/approve`)
			.set(buildAuthHeader(admin));

		expect(res.status).toBe(200);
		expect(res.body.user.status).toBe('aprobado');
		expect(res.body.user.providerProfile.isPublished).toBe(true);
	});

	it('responde 400 si el proveedor no está en revisión', async () => {
		const admin = await createAdmin();
		const vet = await createVetProvider();

		const res = await api()
			.patch(`/api/admin/providers/${vet._id}/approve`)
			.set(buildAuthHeader(admin));

		expect(res.status).toBe(400);
	});
});

describe('PATCH /api/admin/providers/:userId/reject', () => {
	it('rechaza un proveedor en revisión con motivo', async () => {
		const admin = await createAdmin();
		const pending = await createPendingProvider();

		const res = await api()
			.patch(`/api/admin/providers/${pending._id}/reject`)
			.set(buildAuthHeader(admin))
			.send({ reason: 'Documentación incompleta' });

		expect(res.status).toBe(200);
		expect(res.body.user.status).toBe('rechazado');
	});

	it('responde 400 sin reason', async () => {
		const admin = await createAdmin();
		const pending = await createPendingProvider();

		const res = await api()
			.patch(`/api/admin/providers/${pending._id}/reject`)
			.set(buildAuthHeader(admin))
			.send({});

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/reason/i);
	});
});

describe('PATCH /api/admin/providers/:userId/suspend', () => {
	it('suspende un proveedor aprobado', async () => {
		const admin = await createAdmin();
		const vet = await createVetProvider();

		const res = await api()
			.patch(`/api/admin/providers/${vet._id}/suspend`)
			.set(buildAuthHeader(admin))
			.send({ reason: 'Incumplimiento de políticas' });

		expect(res.status).toBe(200);
		expect(res.body.user.status).toBe('suspendido');
	});

	it('responde 400 si intenta suspender un pendiente', async () => {
		const admin = await createAdmin();
		const pending = await createPendingProvider();

		const res = await api()
			.patch(`/api/admin/providers/${pending._id}/suspend`)
			.set(buildAuthHeader(admin))
			.send({ reason: 'Test' });

		expect(res.status).toBe(400);
	});
});
