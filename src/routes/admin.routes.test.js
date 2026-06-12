'use strict';

const { api } = require('../../test/helpers/request');
const { createOwner, createAdmin, buildAuthHeader } = require('../../test/helpers/factories');

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
