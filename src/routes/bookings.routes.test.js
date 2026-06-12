'use strict';

const { api } = require('../../test/helpers/request');
const {
	createOwner,
	createVetProvider,
	createBookingScenario,
	buildAuthHeader
} = require('../../test/helpers/factories');

async function bookAppointment(owner, { provider, pet, slot }) {
	return api()
		.post('/api/appointments')
		.set(buildAuthHeader(owner))
		.send({
			providerId: provider._id.toString(),
			slotId: slot._id.toString(),
			petId: pet._id.toString(),
			reason: 'Reserva unificada test'
		});
}

describe('GET /api/bookings/mine', () => {
	it('responde 403 si el rol no es dueño', async () => {
		const provider = await createVetProvider();
		const res = await api().get('/api/bookings/mine').set(buildAuthHeader(provider));
		expect(res.status).toBe(403);
	});

	it('devuelve reservas unificadas del dueño', async () => {
		const { owner, provider, pet, slot } = await createBookingScenario();
		await bookAppointment(owner, { provider, pet, slot });

		const res = await api().get('/api/bookings/mine').set(buildAuthHeader(owner));

		expect(res.status).toBe(200);
		expect(res.body.canonical).toBe('Appointment');
		expect(res.body.items.length).toBeGreaterThanOrEqual(1);
		expect(res.body.items[0].kind).toBe('appointment');
	});
});

describe('GET /api/bookings/provider/mine', () => {
	it('responde 403 si el rol no es proveedor', async () => {
		const owner = await createOwner();
		const res = await api().get('/api/bookings/provider/mine').set(buildAuthHeader(owner));
		expect(res.status).toBe(403);
	});

	it('devuelve reservas donde el usuario es proveedor', async () => {
		const { owner, provider, pet, slot } = await createBookingScenario();
		await bookAppointment(owner, { provider, pet, slot });

		const res = await api().get('/api/bookings/provider/mine').set(buildAuthHeader(provider));

		expect(res.status).toBe(200);
		expect(res.body.items.length).toBeGreaterThanOrEqual(1);
		expect(res.body.items[0].providerId.toString()).toBe(provider._id.toString());
	});
});
