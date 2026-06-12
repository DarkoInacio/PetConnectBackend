'use strict';

const { api } = require('../../test/helpers/request');
const {
	createOwner,
	createProvider,
	createPet,
	createConfirmedAppointment,
	createClinicalEncounter,
	buildAuthHeader
} = require('../../test/helpers/factories');

const validPetBody = {
	name: 'Luna',
	species: 'gato',
	sex: 'hembra',
	breed: 'Siames',
	birthDate: '2020-05-15',
	color: 'blanco'
};

describe('POST /api/pets', () => {
	it('responde 401 sin autenticación', async () => {
		const res = await api().post('/api/pets').send(validPetBody);

		expect(res.status).toBe(401);
	});

	it('responde 403 si el rol no es dueño', async () => {
		const provider = await createProvider();

		const res = await api()
			.post('/api/pets')
			.set(buildAuthHeader(provider))
			.send(validPetBody);

		expect(res.status).toBe(403);
		expect(res.body.message).toMatch(/no autorizado/i);
	});

	it('responde 400 si faltan campos obligatorios', async () => {
		const owner = await createOwner();

		const res = await api()
			.post('/api/pets')
			.set(buildAuthHeader(owner))
			.send({ name: 'Solo nombre' });

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/obligatorios/i);
	});

	it('responde 400 con species o sex inválidos', async () => {
		const owner = await createOwner();

		const res = await api()
			.post('/api/pets')
			.set(buildAuthHeader(owner))
			.send({ ...validPetBody, species: 'dragon' });

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/species/i);
	});

	it('crea una mascota activa para el dueño (caso feliz)', async () => {
		const owner = await createOwner();

		const res = await api()
			.post('/api/pets')
			.set(buildAuthHeader(owner))
			.send(validPetBody);

		expect(res.status).toBe(201);
		expect(res.body.pet).toMatchObject({
			name: 'Luna',
			species: 'gato',
			sex: 'hembra',
			status: 'active'
		});
		expect(String(res.body.pet.ownerId)).toBe(owner._id.toString());
	});
});

describe('GET /api/pets', () => {
	it('responde 403 si el rol no es dueño', async () => {
		const provider = await createProvider();

		const res = await api().get('/api/pets').set(buildAuthHeader(provider));

		expect(res.status).toBe(403);
	});

	it('lista solo las mascotas del dueño autenticado', async () => {
		const ownerA = await createOwner();
		const ownerB = await createOwner();
		await createPet(ownerA, { name: 'Mascota A' });
		await createPet(ownerA, { name: 'Mascota B' });
		await createPet(ownerB, { name: 'Ajena' });

		const res = await api().get('/api/pets').set(buildAuthHeader(ownerA));

		expect(res.status).toBe(200);
		expect(res.body.pets).toHaveLength(2);
		expect(res.body.pets.every((p) => p.name !== 'Ajena')).toBe(true);
	});

	it('filtra solo activas con forAgenda=1', async () => {
		const owner = await createOwner();
		await createPet(owner, { name: 'Activa', status: 'active' });
		await createPet(owner, { name: 'Fallecida', status: 'deceased' });

		const res = await api().get('/api/pets?forAgenda=1').set(buildAuthHeader(owner));

		expect(res.status).toBe(200);
		expect(res.body.pets).toHaveLength(1);
		expect(res.body.pets[0].name).toBe('Activa');
	});
});

describe('GET /api/pets/:petId', () => {
	it('responde 404 si la mascota no existe', async () => {
		const owner = await createOwner();

		const res = await api()
			.get('/api/pets/507f1f77bcf86cd799439011')
			.set(buildAuthHeader(owner));

		expect(res.status).toBe(404);
	});

	it('responde 403 si otro dueño intenta acceder', async () => {
		const ownerA = await createOwner();
		const ownerB = await createOwner();
		const pet = await createPet(ownerA);

		const res = await api().get(`/api/pets/${pet._id}`).set(buildAuthHeader(ownerB));

		expect(res.status).toBe(403);
	});

	it('permite al dueño ver su mascota', async () => {
		const owner = await createOwner();
		const pet = await createPet(owner, { name: 'Rocky' });

		const res = await api().get(`/api/pets/${pet._id}`).set(buildAuthHeader(owner));

		expect(res.status).toBe(200);
		expect(res.body.pet.name).toBe('Rocky');
	});

	it('permite al veterinario con cita confirmada ver la mascota', async () => {
		const owner = await createOwner();
		const provider = await createProvider();
		const pet = await createPet(owner);
		await createConfirmedAppointment({ owner, provider, pet });

		const res = await api().get(`/api/pets/${pet._id}`).set(buildAuthHeader(provider));

		expect(res.status).toBe(200);
		expect(res.body.pet._id.toString()).toBe(pet._id.toString());
	});

	it('responde 403 al veterinario sin relación con la mascota', async () => {
		const owner = await createOwner();
		const provider = await createProvider();
		const pet = await createPet(owner);

		const res = await api().get(`/api/pets/${pet._id}`).set(buildAuthHeader(provider));

		expect(res.status).toBe(403);
	});
});

describe('PATCH /api/pets/:petId', () => {
	it('responde 404 si la mascota no pertenece al dueño', async () => {
		const ownerA = await createOwner();
		const ownerB = await createOwner();
		const pet = await createPet(ownerA);

		const res = await api()
			.patch(`/api/pets/${pet._id}`)
			.set(buildAuthHeader(ownerB))
			.send({ name: 'Hack' });

		expect(res.status).toBe(404);
	});

	it('actualiza campos permitidos (caso feliz)', async () => {
		const owner = await createOwner();
		const pet = await createPet(owner, { name: 'Viejo' });

		const res = await api()
			.patch(`/api/pets/${pet._id}`)
			.set(buildAuthHeader(owner))
			.send({ name: 'Nuevo nombre', color: 'negro' });

		expect(res.status).toBe(200);
		expect(res.body.pet.name).toBe('Nuevo nombre');
		expect(res.body.pet.color).toBe('negro');
	});

	it('responde 400 si la mascota está fallecida', async () => {
		const owner = await createOwner();
		const pet = await createPet(owner, { status: 'deceased' });

		const res = await api()
			.patch(`/api/pets/${pet._id}`)
			.set(buildAuthHeader(owner))
			.send({ name: 'No debe' });

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/fallecida/i);
	});
});

describe('PATCH /api/pets/:petId/mark-deceased', () => {
	it('marca la mascota como fallecida (caso feliz)', async () => {
		const owner = await createOwner();
		const pet = await createPet(owner);

		const res = await api()
			.patch(`/api/pets/${pet._id}/mark-deceased`)
			.set(buildAuthHeader(owner));

		expect(res.status).toBe(200);
		expect(res.body.pet.status).toBe('deceased');
		expect(res.body.pet.deceasedAt).toBeDefined();
	});

	it('responde 400 si ya estaba fallecida', async () => {
		const owner = await createOwner();
		const pet = await createPet(owner, { status: 'deceased' });

		const res = await api()
			.patch(`/api/pets/${pet._id}/mark-deceased`)
			.set(buildAuthHeader(owner));

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/ya figura/i);
	});
});

describe('GET /api/pets/:petId/medical-summary', () => {
	it('responde 403 si un tercero intenta acceder', async () => {
		const owner = await createOwner();
		const intruder = await createOwner();
		const pet = await createPet(owner);

		const res = await api()
			.get(`/api/pets/${pet._id}/medical-summary`)
			.set(buildAuthHeader(intruder));

		expect(res.status).toBe(403);
	});

	it('devuelve resumen médico al dueño', async () => {
		const owner = await createOwner();
		const pet = await createPet(owner, { name: 'Médica' });

		const res = await api()
			.get(`/api/pets/${pet._id}/medical-summary`)
			.set(buildAuthHeader(owner));

		expect(res.status).toBe(200);
		expect(res.body.pet.name).toBe('Médica');
		expect(res.body.summary).toMatchObject({ totalEncounters: 0, lastVisitAt: null });
	});
});

describe('GET /api/pets/:petId/clinical-encounters', () => {
	it('lista atenciones clínicas al dueño de la mascota', async () => {
		const owner = await createOwner();
		const provider = await createProvider();
		const pet = await createPet(owner);
		const appt = await createConfirmedAppointment({ owner, provider, pet });
		await createClinicalEncounter({ pet, provider, appointment: appt, motivo: 'Control vacunas' });

		const res = await api()
			.get(`/api/pets/${pet._id}/clinical-encounters`)
			.set(buildAuthHeader(owner));

		expect(res.status).toBe(200);
		expect(res.body.encounters).toHaveLength(1);
		expect(res.body.encounters[0].motivo).toBe('Control vacunas');
	});

	it('responde 400 con filtro from inválido', async () => {
		const owner = await createOwner();
		const pet = await createPet(owner);

		const res = await api()
			.get(`/api/pets/${pet._id}/clinical-encounters?from=no-es-fecha`)
			.set(buildAuthHeader(owner));

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/from/i);
	});
});

describe('GET /api/pets/:petId/clinical-encounters/:encounterId', () => {
	it('devuelve detalle de la atención al dueño', async () => {
		const owner = await createOwner();
		const provider = await createProvider();
		const pet = await createPet(owner);
		const appt = await createConfirmedAppointment({ owner, provider, pet });
		const enc = await createClinicalEncounter({
			pet,
			provider,
			appointment: appt,
			diagnostico: 'Sin hallazgos'
		});

		const res = await api()
			.get(`/api/pets/${pet._id}/clinical-encounters/${enc._id}`)
			.set(buildAuthHeader(owner));

		expect(res.status).toBe(200);
		expect(res.body.encounter.diagnostico).toBe('Sin hallazgos');
	});

	it('responde 403 si un tercero intenta ver el detalle', async () => {
		const owner = await createOwner();
		const intruder = await createOwner();
		const provider = await createProvider();
		const pet = await createPet(owner);
		const appt = await createConfirmedAppointment({ owner, provider, pet });
		const enc = await createClinicalEncounter({ pet, provider, appointment: appt });

		const res = await api()
			.get(`/api/pets/${pet._id}/clinical-encounters/${enc._id}`)
			.set(buildAuthHeader(intruder));

		expect(res.status).toBe(403);
	});
});

describe('GET /api/pets/:petId/medical-summary con encounters', () => {
	it('refleja el total de atenciones registradas', async () => {
		const owner = await createOwner();
		const provider = await createProvider();
		const pet = await createPet(owner);
		const appt = await createConfirmedAppointment({ owner, provider, pet });
		await createClinicalEncounter({ pet, provider, appointment: appt });

		const res = await api()
			.get(`/api/pets/${pet._id}/medical-summary`)
			.set(buildAuthHeader(owner));

		expect(res.status).toBe(200);
		expect(res.body.summary.totalEncounters).toBe(1);
		expect(res.body.summary.lastVisitAt).toBeDefined();
	});
});

describe('GET /api/pets/:petId/medical-record/export.pdf', () => {
	it('responde 401 sin token', async () => {
		const res = await api().get('/api/pets/507f1f77bcf86cd799439011/medical-record/export.pdf');

		expect(res.status).toBe(401);
	});

	it('genera PDF para el dueño de la mascota', async () => {
		const owner = await createOwner();
		const pet = await createPet(owner);

		const res = await api()
			.get(`/api/pets/${pet._id}/medical-record/export.pdf`)
			.set(buildAuthHeader(owner));

		expect(res.status).toBe(200);
		expect(res.headers['content-type']).toMatch(/application\/pdf/);
		expect(res.body.length).toBeGreaterThan(100);
	});

	it('responde 403 si otro dueño intenta exportar', async () => {
		const ownerA = await createOwner();
		const ownerB = await createOwner();
		const pet = await createPet(ownerA);

		const res = await api()
			.get(`/api/pets/${pet._id}/medical-record/export.pdf`)
			.set(buildAuthHeader(ownerB));

		expect(res.status).toBe(403);
	});
});
