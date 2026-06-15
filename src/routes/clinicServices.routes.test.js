'use strict';

const { api } = require('../../test/helpers/request');
const {
	createOwner,
	createVetProvider,
	createWalkerProvider,
	createPendingProvider,
	createClinicService,
	buildAuthHeader
} = require('../../test/helpers/factories');

describe('GET /api/provider/clinic-services', () => {
	it('responde 401 sin token', async () => {
		const res = await api().get('/api/provider/clinic-services');
		expect(res.status).toBe(401);
	});

	it('lista servicios del veterinario aprobado', async () => {
		const vet = await createVetProvider();
		await createClinicService(vet, { displayName: 'Vacunación' });

		const res = await api().get('/api/provider/clinic-services').set(buildAuthHeader(vet));

		expect(res.status).toBe(200);
		expect(Array.isArray(res.body.items)).toBe(true);
		expect(res.body.items.length).toBeGreaterThanOrEqual(1);
	});

	it('responde 403 si el proveedor no está aprobado', async () => {
		const pending = await createPendingProvider({ providerType: 'veterinaria' });
		const res = await api().get('/api/provider/clinic-services').set(buildAuthHeader(pending));
		expect(res.status).toBe(403);
	});

	it('responde 403 a dueño', async () => {
		const owner = await createOwner();
		const res = await api().get('/api/provider/clinic-services').set(buildAuthHeader(owner));
		expect(res.status).toBe(403);
	});
});

describe('POST /api/provider/clinic-services', () => {
	it('crea un servicio de clínica', async () => {
		const vet = await createVetProvider();

		const res = await api()
			.post('/api/provider/clinic-services')
			.set(buildAuthHeader(vet))
			.send({ displayName: 'Control post-operatorio', kind: 'consulta', slotDurationMinutes: 30 });

		expect(res.status).toBe(201);
		expect(res.body.service.displayName).toBe('Control post-operatorio');
	});

	it('responde 400 sin displayName', async () => {
		const vet = await createVetProvider();
		const res = await api()
			.post('/api/provider/clinic-services')
			.set(buildAuthHeader(vet))
			.send({ kind: 'consulta' });
		expect(res.status).toBe(400);
	});

	it('exige priceClp para paseador', async () => {
		const walker = await createWalkerProvider();
		const res = await api()
			.post('/api/provider/clinic-services')
			.set(buildAuthHeader(walker))
			.send({ displayName: 'Paseo 1h', kind: 'paseo' });
		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/priceClp/i);
	});
});

describe('PATCH /api/provider/clinic-services/:id', () => {
	it('actualiza un servicio propio', async () => {
		const vet = await createVetProvider();
		const svc = await createClinicService(vet);

		const res = await api()
			.patch(`/api/provider/clinic-services/${svc._id}`)
			.set(buildAuthHeader(vet))
			.send({ displayName: 'Consulta actualizada', active: false });

		expect(res.status).toBe(200);
		expect(res.body.service.displayName).toBe('Consulta actualizada');
		expect(res.body.service.active).toBe(false);
	});
});
