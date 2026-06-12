'use strict';

const {
	findPetForOwner,
	vetHasAccessToPet,
	assertVetAppointmentForPet
} = require('./petAccess.service');
const {
	createOwner,
	createProvider,
	createPet,
	createConfirmedAppointment
} = require('../../test/helpers/factories');

describe('petAccess.service', () => {
	describe('findPetForOwner', () => {
		it('devuelve la mascota cuando pertenece al dueño', async () => {
			const owner = await createOwner();
			const pet = await createPet(owner);

			const found = await findPetForOwner(pet._id, owner._id);

			expect(found).not.toBeNull();
			expect(found._id.toString()).toBe(pet._id.toString());
		});

		it('devuelve null si la mascota pertenece a otro dueño', async () => {
			const ownerA = await createOwner();
			const ownerB = await createOwner();
			const pet = await createPet(ownerA);

			const found = await findPetForOwner(pet._id, ownerB._id);

			expect(found).toBeNull();
		});
	});

	describe('vetHasAccessToPet', () => {
		it('devuelve true si existe cita confirmada entre vet y mascota', async () => {
			const owner = await createOwner();
			const provider = await createProvider();
			const pet = await createPet(owner);
			await createConfirmedAppointment({ owner, provider, pet });

			const hasAccess = await vetHasAccessToPet(provider._id, pet._id);

			expect(hasAccess).toBe(true);
		});

		it('devuelve false sin cita confirmada o completada', async () => {
			const owner = await createOwner();
			const provider = await createProvider();
			const pet = await createPet(owner);

			const hasAccess = await vetHasAccessToPet(provider._id, pet._id);

			expect(hasAccess).toBe(false);
		});
	});

	describe('assertVetAppointmentForPet', () => {
		it('devuelve la cita cuando coincide proveedor, mascota y estado permitido', async () => {
			const owner = await createOwner();
			const provider = await createProvider();
			const pet = await createPet(owner);
			const appt = await createConfirmedAppointment({ owner, provider, pet });

			const result = await assertVetAppointmentForPet({
				appointmentId: appt._id,
				providerUserId: provider._id,
				petId: pet._id
			});

			expect(result).not.toBeNull();
			expect(result._id.toString()).toBe(appt._id.toString());
		});

		it('devuelve null si la cita no pertenece al proveedor', async () => {
			const owner = await createOwner();
			const providerA = await createProvider();
			const providerB = await createProvider();
			const pet = await createPet(owner);
			const appt = await createConfirmedAppointment({ owner, provider: providerA, pet });

			const result = await assertVetAppointmentForPet({
				appointmentId: appt._id,
				providerUserId: providerB._id,
				petId: pet._id
			});

			expect(result).toBeNull();
		});
	});
});
