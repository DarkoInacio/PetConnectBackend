'use strict';

const { api } = require('../../test/helpers/request');
const {
	createOwner,
	createVetProvider,
	createPet,
	createCompletedAppointment,
	buildAuthHeader
} = require('../../test/helpers/factories');

describe('GET /api/provider/reviews', () => {
	it('responde 403 si no es proveedor', async () => {
		const owner = await createOwner();
		const res = await api().get('/api/provider/reviews').set(buildAuthHeader(owner));
		expect(res.status).toBe(403);
	});

	it('lista reseñas del proveedor autenticado', async () => {
		const owner = await createOwner();
		const provider = await createVetProvider();
		const pet = await createPet(owner);
		const appointment = await createCompletedAppointment({ owner, provider, pet });

		await api()
			.post(`/api/appointments/${appointment._id}/reviews`)
			.set(buildAuthHeader(owner))
			.send({ rating: 5, comment: 'Muy bueno' });

		const res = await api().get('/api/provider/reviews').set(buildAuthHeader(provider));
		expect(res.status).toBe(200);
		expect(res.body.reviews.length).toBeGreaterThanOrEqual(1);
	});
});
