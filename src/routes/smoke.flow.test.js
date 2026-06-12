'use strict';

/**
 * Réplica del flujo Newman (carpeta Smoke) contra la app en memoria.
 */
const { api } = require('../../test/helpers/request');
const {
	createOwner,
	createVetProvider,
	createPet,
	createClinicService,
	createAvailableSlot
} = require('../../test/helpers/factories');

const SMOKE_OWNER = {
	email: 'smoke.qa@test.com',
	password: 'SmokeTest2026!'
};

const SMOKE_VET = {
	email: 'vet@prueba.cl',
	password: 'prueba123'
};

describe('Smoke flow (equivalente Newman)', () => {
	it('ejecuta la secuencia SMK-001 → SMK-015', async () => {
		const owner = await createOwner({
			email: SMOKE_OWNER.email,
			password: SMOKE_OWNER.password,
			name: 'Smoke',
			lastName: 'QA'
		});

		const vet = await createVetProvider({
			email: SMOKE_VET.email,
			password: SMOKE_VET.password,
			name: 'Vet',
			lastName: 'Prueba',
			providerProfile: {
				description: 'Clínica veterinaria smoke QA',
				isPublished: true,
				publicSlug: 'vet-prueba-smoke',
				address: {
					street: 'Av. Providencia 100',
					commune: 'Providencia',
					city: 'Santiago',
					coordinates: { lat: -33.4489, lng: -70.6693 }
				},
				agendaSlotStart: '09:00',
				agendaSlotEnd: '18:00'
			}
		});

		const pet = await createPet(owner, { name: 'Luna Smoke' });
		const clinicService = await createClinicService(vet, { displayName: 'Consulta general' });
		await createAvailableSlot({ provider: vet, clinicService });

		const health = await api().get('/health');
		expect(health.status).toBe(200);
		expect(health.body.status).toBe('ok');

		const loginOwner = await api().post('/api/auth/login').send(SMOKE_OWNER);
		expect(loginOwner.status).toBe(200);
		const tokenDueno = loginOwner.body.token;

		const pets = await api().get('/api/pets').set('Authorization', `Bearer ${tokenDueno}`);
		expect([200, 201]).toContain(pets.status);

		const mapa = await api().get('/api/proveedores/mapa?lat=-33.4489&lng=-70.6693&radioKm=15');
		expect([200, 201]).toContain(mapa.status);

		const buscar = await api().get('/api/proveedores/buscar?tipo=veterinaria&pagina=1&limite=5');
		expect([200, 201]).toContain(buscar.status);

		const slots = await api()
			.get(
				`/api/appointments/providers/${vet._id}/available-slots?clinicServiceId=${clinicService._id}`
			)
			.set('Authorization', `Bearer ${tokenDueno}`);
		expect([200, 201]).toContain(slots.status);
		expect(slots.body.slots?.length).toBeGreaterThan(0);
		const slotId = slots.body.slots[0]._id;

		const cita = await api()
			.post('/api/appointments')
			.set('Authorization', `Bearer ${tokenDueno}`)
			.send({
				providerId: String(vet._id),
				slotId: String(slotId),
				petId: String(pet._id),
				reason: 'Smoke test Postman'
			});
		expect(cita.status).toBe(201);

		const bookings = await api().get('/api/bookings/mine').set('Authorization', `Bearer ${tokenDueno}`);
		expect([200, 201]).toContain(bookings.status);

		const loginVet = await api().post('/api/auth/login').send(SMOKE_VET);
		expect(loginVet.status).toBe(200);
		const tokenVet = loginVet.body.token;

		const patients = await api().get('/api/vet/patients').set('Authorization', `Bearer ${tokenVet}`);
		expect([200, 201]).toContain(patients.status);

		const ficha = await api()
			.get(`/api/pets/${pet._id}/medical-summary`)
			.set('Authorization', `Bearer ${tokenDueno}`);
		expect([200, 201]).toContain(ficha.status);

		const chat = await api().post('/api/chat').send({ message: 'Hola, mi gato no come desde ayer' });
		expect([200, 201]).toContain(chat.status);

		const forgot = await api().post('/api/auth/forgot-password').send({ email: SMOKE_OWNER.email });
		expect(forgot.status).toBe(200);
	});
});
