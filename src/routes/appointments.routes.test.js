'use strict';

const AvailabilitySlot = require('../models/AvailabilitySlot');
const { api } = require('../../test/helpers/request');
const {
	createOwner,
	createVetProvider,
	createPet,
	createBookingScenario,
	createAvailableSlot,
	createClinicService,
	buildAuthHeader
} = require('../../test/helpers/factories');

async function bookAppointment(owner, { provider, pet, slot, status }) {
	const body = {
		providerId: provider._id.toString(),
		slotId: slot._id.toString(),
		petId: pet._id.toString(),
		reason: 'Consulta de prueba Jest'
	};
	if (status) body.status = status;
	return api().post('/api/appointments').set(buildAuthHeader(owner)).send(body);
}

describe('GET /api/appointments/providers/:providerId/available-slots', () => {
	it('responde 401 sin autenticación', async () => {
		const res = await api().get('/api/appointments/providers/507f1f77bcf86cd799439011/available-slots');
		expect(res.status).toBe(401);
	});

	it('responde 403 si el rol no es dueño', async () => {
		const provider = await createVetProvider();
		const res = await api()
			.get(`/api/appointments/providers/${provider._id}/available-slots`)
			.set(buildAuthHeader(provider));
		expect(res.status).toBe(403);
	});

	it('lista slots disponibles del proveedor (caso feliz)', async () => {
		const { owner, provider, clinicService, slot } = await createBookingScenario();

		const res = await api()
			.get(
				`/api/appointments/providers/${provider._id}/available-slots?clinicServiceId=${clinicService._id}`
			)
			.set(buildAuthHeader(owner));

		expect(res.status).toBe(200);
		expect(res.body.slots.length).toBeGreaterThanOrEqual(1);
		expect(res.body.slots.some((s) => String(s._id) === slot._id.toString())).toBe(true);
	});
});

describe('POST /api/appointments', () => {
	it('responde 401 sin autenticación', async () => {
		const res = await api().post('/api/appointments').send({});
		expect(res.status).toBe(401);
	});

	it('responde 403 si el rol no es dueño', async () => {
		const { provider, pet, slot } = await createBookingScenario();
		const res = await api()
			.post('/api/appointments')
			.set(buildAuthHeader(provider))
			.send({
				providerId: provider._id,
				slotId: slot._id,
				petId: pet._id
			});
		expect(res.status).toBe(403);
	});

	it('responde 400 si faltan campos obligatorios', async () => {
		const owner = await createOwner();
		const res = await api().post('/api/appointments').set(buildAuthHeader(owner)).send({ providerId: 'x' });
		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/obligatorios/i);
	});

	it('agenda cita consumiendo el slot (caso feliz)', async () => {
		const owner = await createOwner();
		const provider = await createVetProvider();
		const pet = await createPet(owner);
		const clinicService = await createClinicService(provider);
		const slot = await createAvailableSlot({ provider, clinicService });

		const res = await bookAppointment(owner, { provider, pet, slot });

		expect(res.status).toBe(201);
		expect(res.body.appointment).toMatchObject({
			status: 'pending_confirmation',
			bookingSource: 'availability_slot'
		});

		const slotGone = await AvailabilitySlot.findById(slot._id);
		expect(slotGone).toBeNull();
	});

	it('responde 409 si el slot ya no está disponible', async () => {
		const { owner, provider, pet, slot } = await createBookingScenario();

		const first = await bookAppointment(owner, { provider, pet, slot });
		expect(first.status).toBe(201);

		const res = await bookAppointment(owner, { provider, pet, slot });
		expect(res.status).toBe(409);
		expect(res.body.message).toMatch(/disponible/i);
	});
});

describe('GET /api/appointments/mine', () => {
	it('lista las citas del dueño autenticado', async () => {
		const { owner, provider, pet, slot } = await createBookingScenario();
		await bookAppointment(owner, { provider, pet, slot });

		const res = await api().get('/api/appointments/mine').set(buildAuthHeader(owner));

		expect(res.status).toBe(200);
		expect(res.body.appointments.length).toBeGreaterThanOrEqual(1);
	});
});

describe('Flujo proveedor: confirmar y completar cita', () => {
	it('el proveedor confirma una cita pendiente', async () => {
		const { owner, provider, pet, slot } = await createBookingScenario();
		const booked = await bookAppointment(owner, { provider, pet, slot });
		const appointmentId = booked.body.appointment._id;

		const res = await api()
			.patch(`/api/appointments/${appointmentId}/provider/confirm`)
			.set(buildAuthHeader(provider));

		expect(res.status).toBe(200);
		expect(res.body.appointment.status).toBe('confirmed');
	});

	it('responde 403 si el dueño intenta confirmar como proveedor', async () => {
		const { owner, provider, pet, slot } = await createBookingScenario();
		const booked = await bookAppointment(owner, { provider, pet, slot });

		const res = await api()
			.patch(`/api/appointments/${booked.body.appointment._id}/provider/confirm`)
			.set(buildAuthHeader(owner));

		expect(res.status).toBe(403);
	});

	it('el proveedor marca la cita de agenda como completada', async () => {
		const { owner, provider, pet, slot } = await createBookingScenario();
		const booked = await bookAppointment(owner, { provider, pet, slot, status: 'confirmed' });
		const appointmentId = booked.body.appointment._id;

		const res = await api()
			.patch(`/api/appointments/${appointmentId}/provider/complete-vet`)
			.set(buildAuthHeader(provider));

		expect(res.status).toBe(200);
		expect(res.body.appointment.status).toBe('completed');
	});
});

describe('PATCH /api/appointments/:id/cancel', () => {
	it('responde 400 sin cancellationReason', async () => {
		const { owner, provider, pet, slot } = await createBookingScenario();
		const booked = await bookAppointment(owner, { provider, pet, slot });

		const res = await api()
			.patch(`/api/appointments/${booked.body.appointment._id}/cancel`)
			.set(buildAuthHeader(owner))
			.send({});

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/cancellationReason/i);
	});

	it('el dueño cancela con al menos 2h de anticipación (caso feliz)', async () => {
		const { owner, provider, pet, slot } = await createBookingScenario();
		const booked = await bookAppointment(owner, { provider, pet, slot });

		const res = await api()
			.patch(`/api/appointments/${booked.body.appointment._id}/cancel`)
			.set(buildAuthHeader(owner))
			.send({ cancellationReason: 'Cambio de planes' });

		expect(res.status).toBe(200);
		expect(res.body.appointment.status).toBe('cancelled_by_owner');
	});
});
