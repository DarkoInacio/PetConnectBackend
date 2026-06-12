'use strict';

const { api } = require('../../test/helpers/request');
const {
	createOwner,
	createProvider,
	createPet,
	createConfirmedAppointment,
	createEditableAppointment,
	createClinicalEncounter,
	buildAuthHeader
} = require('../../test/helpers/factories');

describe('POST /api/vet/pets/:petId/clinical-encounters', () => {
	it('responde 401 sin autenticación', async () => {
		const res = await api()
			.post('/api/vet/pets/507f1f77bcf86cd799439011/clinical-encounters')
			.send({ motivo: 'Test' });

		expect(res.status).toBe(401);
	});

	it('responde 403 si el usuario no es veterinaria', async () => {
		const owner = await createOwner();
		const pet = await createPet(owner);

		const res = await api()
			.post(`/api/vet/pets/${pet._id}/clinical-encounters`)
			.set(buildAuthHeader(owner))
			.send({ motivo: 'Test' });

		expect(res.status).toBe(403);
	});

	it('responde 403 si el proveedor no es veterinaria', async () => {
		const owner = await createOwner();
		const walker = await createProvider({
			providerType: 'paseador',
			providerProfile: { description: 'Paseos' }
		});
		const pet = await createPet(owner);

		const res = await api()
			.post(`/api/vet/pets/${pet._id}/clinical-encounters`)
			.set(buildAuthHeader(walker))
			.send({ motivo: 'Test' });

		expect(res.status).toBe(403);
		expect(res.body.message).toMatch(/veterinaria/i);
	});

	it('responde 400 si falta appointmentId', async () => {
		const owner = await createOwner();
		const provider = await createProvider();
		const pet = await createPet(owner);
		await createConfirmedAppointment({ owner, provider, pet });

		const res = await api()
			.post(`/api/vet/pets/${pet._id}/clinical-encounters`)
			.set(buildAuthHeader(provider))
			.send({ motivo: 'Control anual' });

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/appointmentId/i);
	});

	it('responde 403 si la cita no pertenece al veterinario', async () => {
		const owner = await createOwner();
		const providerA = await createProvider();
		const providerB = await createProvider();
		const pet = await createPet(owner);
		const appt = await createConfirmedAppointment({ owner, provider: providerA, pet });

		const res = await api()
			.post(`/api/vet/pets/${pet._id}/clinical-encounters`)
			.set(buildAuthHeader(providerB))
			.send({ appointmentId: appt._id, motivo: 'Intento ajeno' });

		expect(res.status).toBe(403);
	});

	it('crea un encounter clínico vinculado a la cita (caso feliz)', async () => {
		const owner = await createOwner();
		const provider = await createProvider();
		const pet = await createPet(owner);
		const appt = await createConfirmedAppointment({ owner, provider, pet });

		const res = await api()
			.post(`/api/vet/pets/${pet._id}/clinical-encounters`)
			.set(buildAuthHeader(provider))
			.send({
				appointmentId: appt._id.toString(),
				motivo: 'Revisión general',
				type: 'consulta',
				diagnostico: 'Saludable'
			});

		expect(res.status).toBe(201);
		expect(res.body.encounter).toMatchObject({
			motivo: 'Revisión general',
			type: 'consulta',
			diagnostico: 'Saludable'
		});
		expect(res.body.encounter.signedByName).toBeDefined();
	});

	it('responde 409 si ya existe encounter para la misma cita', async () => {
		const owner = await createOwner();
		const provider = await createProvider();
		const pet = await createPet(owner);
		const appt = await createConfirmedAppointment({ owner, provider, pet });
		await createClinicalEncounter({ pet, provider, appointment: appt });

		const res = await api()
			.post(`/api/vet/pets/${pet._id}/clinical-encounters`)
			.set(buildAuthHeader(provider))
			.send({ appointmentId: appt._id, motivo: 'Duplicado' });

		expect(res.status).toBe(409);
	});
});

describe('GET /api/vet/pets/:petId/clinical-encounters', () => {
	it('lista encounters para el veterinario con acceso', async () => {
		const owner = await createOwner();
		const provider = await createProvider();
		const pet = await createPet(owner);
		const appt = await createConfirmedAppointment({ owner, provider, pet });
		await createClinicalEncounter({ pet, provider, appointment: appt, motivo: 'Primera visita' });

		const res = await api()
			.get(`/api/vet/pets/${pet._id}/clinical-encounters`)
			.set(buildAuthHeader(provider));

		expect(res.status).toBe(200);
		expect(res.body.encounters).toHaveLength(1);
		expect(res.body.encounters[0].motivo).toBe('Primera visita');
	});
});

describe('GET /api/vet/pets/:petId/clinical-encounters/:encounterId', () => {
	it('devuelve el detalle del encounter al veterinario autora', async () => {
		const owner = await createOwner();
		const provider = await createProvider();
		const pet = await createPet(owner);
		const appt = await createConfirmedAppointment({ owner, provider, pet });
		const enc = await createClinicalEncounter({ pet, provider, appointment: appt });

		const res = await api()
			.get(`/api/vet/pets/${pet._id}/clinical-encounters/${enc._id}`)
			.set(buildAuthHeader(provider));

		expect(res.status).toBe(200);
		expect(res.body.encounter._id.toString()).toBe(enc._id.toString());
	});
});

describe('PATCH /api/vet/clinical-encounters/:encounterId', () => {
	it('actualiza el encounter dentro de la ventana de edición', async () => {
		const owner = await createOwner();
		const provider = await createProvider();
		const pet = await createPet(owner);
		const appt = await createEditableAppointment({ owner, provider, pet });
		const enc = await createClinicalEncounter({ pet, provider, appointment: appt });

		const res = await api()
			.patch(`/api/vet/clinical-encounters/${enc._id}`)
			.set(buildAuthHeader(provider))
			.send({ diagnostico: 'Actualizado en consulta' });

		expect(res.status).toBe(200);
		expect(res.body.encounter.diagnostico).toBe('Actualizado en consulta');
	});

	it('responde 403 si otro veterinario intenta editar', async () => {
		const owner = await createOwner();
		const providerA = await createProvider();
		const providerB = await createProvider();
		const pet = await createPet(owner);
		const appt = await createEditableAppointment({ owner, provider: providerA, pet });
		const enc = await createClinicalEncounter({ pet, provider: providerA, appointment: appt });

		const res = await api()
			.patch(`/api/vet/clinical-encounters/${enc._id}`)
			.set(buildAuthHeader(providerB))
			.send({ diagnostico: 'Hack' });

		expect(res.status).toBe(403);
	});
});
