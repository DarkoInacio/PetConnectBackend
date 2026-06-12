'use strict';

const { api } = require('../../test/helpers/request');
const {
	createOwner,
	createVetProvider,
	createBookingScenario,
	buildAuthHeader
} = require('../../test/helpers/factories');

describe('GET /api/provider/agenda/slots', () => {
	it('responde 403 si el usuario no es proveedor', async () => {
		const owner = await createOwner();
		const res = await api().get('/api/provider/agenda/slots').set(buildAuthHeader(owner));
		expect(res.status).toBe(403);
	});

	it('lista los slots del proveedor veterinario autenticado', async () => {
		const { provider, slot } = await createBookingScenario();

		const res = await api().get('/api/provider/agenda/slots').set(buildAuthHeader(provider));

		expect(res.status).toBe(200);
		expect(res.body.slots.length).toBeGreaterThanOrEqual(1);
		expect(res.body.slots.some((s) => String(s._id) === slot._id.toString())).toBe(true);
	});
});

describe('PATCH /api/provider/agenda/slots/:slotId/block', () => {
	it('bloquea un slot disponible del proveedor', async () => {
		const { provider, slot } = await createBookingScenario();

		const res = await api()
			.patch(`/api/provider/agenda/slots/${slot._id}/block`)
			.set(buildAuthHeader(provider));

		expect(res.status).toBe(200);
		expect(res.body.slot.status).toBe('blocked');
	});

	it('responde 404 si otro proveedor intenta bloquear el slot', async () => {
		const { slot } = await createBookingScenario();
		const intruder = await createVetProvider();

		const res = await api()
			.patch(`/api/provider/agenda/slots/${slot._id}/block`)
			.set(buildAuthHeader(intruder));

		expect(res.status).toBe(404);
	});
});
