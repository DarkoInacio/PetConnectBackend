'use strict';

const { api } = require('../../test/helpers/request');
const {
	createOwner,
	createVetProvider,
	createPet,
	createCompletedAppointment,
	buildAuthHeader
} = require('../../test/helpers/factories');

async function createReviewableSetup() {
	const owner = await createOwner();
	const provider = await createVetProvider();
	const pet = await createPet(owner);
	const appointment = await createCompletedAppointment({ owner, provider, pet });
	return { owner, provider, pet, appointment };
}

describe('POST /api/appointments/:id/reviews', () => {
	it('responde 403 si otro usuario intenta reseñar', async () => {
		const { owner, appointment } = await createReviewableSetup();
		const intruder = await createOwner();

		const res = await api()
			.post(`/api/appointments/${appointment._id}/reviews`)
			.set(buildAuthHeader(intruder))
			.send({ rating: 5, comment: 'Genial' });

		expect(res.status).toBe(403);
	});

	it('publica reseña tras cita completada (caso feliz)', async () => {
		const { owner, appointment } = await createReviewableSetup();

		const res = await api()
			.post(`/api/appointments/${appointment._id}/reviews`)
			.set(buildAuthHeader(owner))
			.send({ rating: 5, comment: 'Excelente atención' });

		expect(res.status).toBe(201);
		expect(res.body.review.rating).toBe(5);
	});
});

describe('GET /api/proveedores/:providerId/reviews', () => {
	it('lista reseñas públicas del proveedor', async () => {
		const { owner, provider, appointment } = await createReviewableSetup();
		await api()
			.post(`/api/appointments/${appointment._id}/reviews`)
			.set(buildAuthHeader(owner))
			.send({ rating: 4, comment: 'Buena' });

		const res = await api().get(`/api/proveedores/${provider._id}/reviews`);
		expect(res.status).toBe(200);
		expect(res.body.reviews.length).toBeGreaterThanOrEqual(1);
	});
});

describe('PATCH /api/reviews/:reviewId', () => {
	it('el dueño edita su reseña dentro de 24h', async () => {
		const { owner, appointment } = await createReviewableSetup();
		const created = await api()
			.post(`/api/appointments/${appointment._id}/reviews`)
			.set(buildAuthHeader(owner))
			.send({ rating: 3, comment: 'Regular' });

		const res = await api()
			.patch(`/api/reviews/${created.body.review._id}`)
			.set(buildAuthHeader(owner))
			.send({ rating: 5, comment: 'Mejor de lo pensado' });

		expect(res.status).toBe(200);
		expect(res.body.review.rating).toBe(5);
	});
});

describe('POST /api/reviews/:reviewId/report', () => {
	it('permite reportar reseña ajena', async () => {
		const { owner, provider, appointment } = await createReviewableSetup();
		const created = await api()
			.post(`/api/appointments/${appointment._id}/reviews`)
			.set(buildAuthHeader(owner))
			.send({ rating: 1, comment: 'Malo' });

		const reporter = await createOwner();
		const res = await api()
			.post(`/api/reviews/${created.body.review._id}/report`)
			.set(buildAuthHeader(reporter))
			.send({ reason: 'spam' });

		expect(res.status).toBe(201);
	});
});
