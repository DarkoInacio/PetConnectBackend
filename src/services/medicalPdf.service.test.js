'use strict';

const { PassThrough } = require('stream');
const { assertPdfAccess, streamMedicalRecordPdf } = require('./medicalPdf.service');
const {
	createOwner,
	createProvider,
	createPet,
	createClinicalEncounter,
	createConfirmedAppointment
} = require('../../test/helpers/factories');

function streamToBuffer(streamMedicalFn, params) {
	return new Promise((resolve, reject) => {
		const res = new PassThrough();
		res.setHeader = () => res;
		const chunks = [];
		res.on('data', (chunk) => chunks.push(chunk));
		res.on('end', () => resolve(Buffer.concat(chunks)));
		res.on('error', reject);
		streamMedicalFn(res, params).catch(reject);
	});
}

describe('medicalPdf.service', () => {
	describe('assertPdfAccess', () => {
		it('devuelve la mascota cuando el dueño es el propietario', async () => {
			const owner = await createOwner();
			const pet = await createPet(owner);

			const result = await assertPdfAccess({
				petId: pet._id,
				requesterId: owner._id.toString(),
				requesterRole: 'dueno'
			});

			expect(result._id.toString()).toBe(pet._id.toString());
		});

		it('lanza 404 si la mascota no existe', async () => {
			const owner = await createOwner();

			await expect(
				assertPdfAccess({
					petId: '507f1f77bcf86cd799439011',
					requesterId: owner._id.toString(),
					requesterRole: 'dueno'
				})
			).rejects.toMatchObject({ status: 404, message: 'Mascota no encontrada' });
		});

		it('lanza 403 si otro dueño intenta descargar la ficha', async () => {
			const ownerA = await createOwner();
			const ownerB = await createOwner();
			const pet = await createPet(ownerA);

			await expect(
				assertPdfAccess({
					petId: pet._id,
					requesterId: ownerB._id.toString(),
					requesterRole: 'dueno'
				})
			).rejects.toMatchObject({ status: 403, message: 'No autorizado' });
		});

		it('permite al veterinario con cita confirmada', async () => {
			const owner = await createOwner();
			const provider = await createProvider();
			const pet = await createPet(owner);
			await createConfirmedAppointment({ owner, provider, pet });

			const result = await assertPdfAccess({
				petId: pet._id,
				requesterId: provider._id.toString(),
				requesterRole: 'proveedor'
			});

			expect(result._id.toString()).toBe(pet._id.toString());
		});

		it('lanza 403 al veterinario sin relación con la mascota', async () => {
			const owner = await createOwner();
			const provider = await createProvider();
			const pet = await createPet(owner);

			await expect(
				assertPdfAccess({
					petId: pet._id,
					requesterId: provider._id.toString(),
					requesterRole: 'proveedor'
				})
			).rejects.toMatchObject({ status: 403 });
		});

		it('lanza 403 para roles distintos de dueño o proveedor', async () => {
			const admin = await createOwner({ role: 'admin', roles: ['admin'] });
			const pet = await createPet(admin);

			await expect(
				assertPdfAccess({
					petId: pet._id,
					requesterId: admin._id.toString(),
					requesterRole: 'admin'
				})
			).rejects.toMatchObject({ status: 403 });
		});
	});

	describe('streamMedicalRecordPdf', () => {
		it('genera un PDF con cabecera application/pdf para el dueño', async () => {
			const owner = await createOwner();
			const pet = await createPet(owner);

			const buffer = await streamToBuffer(streamMedicalRecordPdf, {
				petId: pet._id.toString(),
				requesterId: owner._id.toString(),
				requesterRole: 'dueno',
				requesterEmail: owner.email
			});

			expect(buffer.length).toBeGreaterThan(100);
			expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
		});

		it('incluye atenciones clínicas en el documento generado', async () => {
			const owner = await createOwner();
			const provider = await createProvider();
			const pet = await createPet(owner);
			const appt = await createConfirmedAppointment({ owner, provider, pet });
			await createClinicalEncounter({
				pet,
				provider,
				appointment: appt,
				motivo: 'Vacuna antirrábica'
			});

			const buffer = await streamToBuffer(streamMedicalRecordPdf, {
				petId: pet._id.toString(),
				requesterId: owner._id.toString(),
				requesterRole: 'dueno',
				requesterEmail: owner.email
			});

			expect(buffer.length).toBeGreaterThan(200);
			expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
		});
	});
});
