/**
 * Datos semilla idempotentes para ciclo QA (TCP-001).
 * Genera postman/PetConnect-QA.postman_environment.json
 *
 * Uso: node scripts/seed-qa.js
 * Requiere: MONGODB_URI
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { DateTime } = require('luxon');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Pet = require('../src/models/Pet');
const ClinicService = require('../src/models/ClinicService');
const AvailabilitySlot = require('../src/models/AvailabilitySlot');
const Appointment = require('../src/models/Appointment');
const ClinicalEncounter = require('../src/models/ClinicalEncounter');

const QA_PASSWORD = process.env.QA_DEFAULT_PASSWORD || 'QaTest2026!';
const SANTIAGO = { lat: -33.4489, lng: -70.6693 };
const AGENDA_ZONE = process.env.AGENDA_TIMEZONE || 'America/Santiago';

const USERS = {
	admin: {
		email: 'admin@petconnect.test',
		name: 'Admin',
		lastName: 'QA',
		role: 'admin',
		roles: ['admin'],
		status: 'activo'
	},
	dueno1: {
		email: 'dueno1@petconnect.test',
		name: 'Dueño',
		lastName: 'Uno',
		role: 'dueno',
		roles: ['dueno'],
		status: 'activo'
	},
	dueno2: {
		email: 'dueno2@petconnect.test',
		name: 'Dueño',
		lastName: 'Dos',
		role: 'dueno',
		roles: ['dueno'],
		status: 'activo'
	},
	vet: {
		email: 'vet@petconnect.test',
		name: 'Vet',
		lastName: 'QA',
		role: 'proveedor',
		roles: ['proveedor'],
		providerType: 'veterinaria',
		status: 'aprobado',
		providerProfile: {
			description: 'Clínica veterinaria QA',
			isPublished: true,
			publicSlug: 'vet-qa-tcp001',
			address: {
				street: 'Av. Providencia 200',
				commune: 'Providencia',
				city: 'Santiago',
				coordinates: SANTIAGO
			},
			agendaSlotStart: '09:00',
			agendaSlotEnd: '18:00'
		}
	},
	paseador: {
		email: 'paseador@petconnect.test',
		name: 'Paseador',
		lastName: 'QA',
		role: 'proveedor',
		roles: ['proveedor'],
		providerType: 'paseador',
		status: 'aprobado',
		providerProfile: {
			description: 'Paseador QA',
			isPublished: true,
			publicSlug: 'paseador-qa-tcp001',
			address: {
				city: 'Santiago',
				commune: 'Providencia',
				coordinates: SANTIAGO
			},
			weeklyAvailability: [{ day: 'monday', enabled: true, ranges: [{ start: '09:00', end: '18:00' }] }]
		}
	},
	cuidador: {
		email: 'cuidador@petconnect.test',
		name: 'Cuidador',
		lastName: 'QA',
		role: 'proveedor',
		roles: ['proveedor'],
		providerType: 'cuidador',
		status: 'en_revision',
		providerProfile: {
			description: 'Cuidador pendiente de aprobación',
			isPublished: false,
			publicSlug: 'cuidador-qa-tcp001',
			address: {
				city: 'Santiago',
				commune: 'Providencia',
				coordinates: SANTIAGO
			}
		}
	}
};

async function upsertUser(def) {
	const normalized = String(def.email).toLowerCase().trim();
	let user = await User.findOne({ email: normalized }).select('+password');
	const payload = {
		name: def.name,
		lastName: def.lastName,
		role: def.role,
		roles: def.roles,
		status: def.status,
		providerType: def.providerType ?? null,
		providerProfile: def.providerProfile ?? null,
		password: QA_PASSWORD
	};
	if (user) {
		Object.assign(user, payload);
		await user.save();
		return user;
	}
	return User.create({ email: normalized, ...payload });
}

async function ensurePet(ownerId, data) {
	let pet = await Pet.findOne({ ownerId, name: data.name });
	if (!pet) {
		pet = await Pet.create({ ownerId, ...data });
	} else {
		pet.status = data.status || 'active';
		pet.deceasedAt = null;
		await pet.save();
	}
	return pet;
}

async function ensureClinicService(providerId) {
	let svc = await ClinicService.findOne({ providerId, displayName: 'Consulta general' });
	if (!svc) {
		svc = await ClinicService.create({
			providerId,
			displayName: 'Consulta general',
			kind: 'consulta',
			slotDurationMinutes: 30,
			active: true
		});
	}
	return svc;
}

async function ensureSlot(providerId, clinicServiceId) {
	const startAt = DateTime.now()
		.setZone(AGENDA_ZONE)
		.plus({ days: 1 })
		.set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
	const endAt = startAt.plus({ minutes: 30 });

	await AvailabilitySlot.deleteMany({
		providerId,
		clinicServiceId,
		status: 'available',
		startAt: { $gte: new Date() }
	});

	return AvailabilitySlot.create({
		providerId,
		clinicServiceId,
		startAt: startAt.toJSDate(),
		endAt: endAt.toJSDate(),
		status: 'available'
	});
}

async function ensureCompletedAppointment({ owner, provider, pet }) {
	const existing = await Appointment.findOne({
		ownerId: owner._id,
		providerId: provider._id,
		petId: pet._id,
		status: 'completed',
		reason: 'Cita QA TCP-001'
	});
	if (existing) return existing;

	const now = Date.now();
	return Appointment.create({
		ownerId: owner._id,
		providerId: provider._id,
		petId: pet._id,
		bookingSource: 'availability_slot',
		startAt: new Date(now - 48 * 60 * 60 * 1000),
		endAt: new Date(now - 47 * 60 * 60 * 1000),
		status: 'completed',
		reason: 'Cita QA TCP-001'
	});
}

async function ensureEncounter({ pet, provider, appointment }) {
	let enc = await ClinicalEncounter.findOne({ appointmentId: appointment._id });
	if (enc) return enc;

	return ClinicalEncounter.create({
		petId: pet._id,
		providerId: provider._id,
		appointmentId: appointment._id,
		type: 'consulta',
		occurredAt: appointment.startAt,
		motivo: 'Control rutinario QA',
		diagnostico: 'Estado general bueno',
		tratamiento: 'Continuar alimentación habitual',
		signedAt: new Date(),
		signedByName: 'Dr. Vet QA',
		attachments: [
			{
				filename: 'qa-lab-result.pdf',
				originalName: 'resultado-lab-qa.pdf',
				mime: 'application/pdf',
				size: 1024
			}
		]
	});
}

function buildQaEnvironment(ids) {
	const port = process.env.PORT || 3000;
	const baseHost = process.env.QA_BASE_HOST || `http://localhost:${port}`;

	const entries = [
		['baseUrl', `${baseHost}/api`],
		['healthUrl', `${baseHost}/health`],
		['qa_password', QA_PASSWORD],
		['email_admin', USERS.admin.email],
		['email_dueno', USERS.dueno1.email],
		['email_dueno2', USERS.dueno2.email],
		['email_vet', USERS.vet.email],
		['email_paseador', USERS.paseador.email],
		['email_cuidador', USERS.cuidador.email],
		['password_dueno', QA_PASSWORD],
		['password_vet', QA_PASSWORD],
		['password_admin', QA_PASSWORD],
		['providerId', ids.vetId],
		['providerUserId', ids.vetId],
		['walkerProviderId', ids.paseadorId],
		['pendingProviderId', ids.cuidadorId],
		['petId', ids.firulaisId],
		['petId_gato', ids.mishiId],
		['clinicServiceId', ids.clinicServiceId],
		['slotId', ids.slotId],
		['appointmentId', ids.appointmentId],
		['encounterId', ids.encounterId],
		['mapLat', String(SANTIAGO.lat)],
		['mapLng', String(SANTIAGO.lng)],
		['mapRadioKm', '15'],
		['token_dueno', ''],
		['token_vet', ''],
		['token_admin', '']
	];

	return {
		id: 'qa-tcp001-env',
		name: 'PetConnect - QA TCP-001',
		values: entries.map(([key, value]) => ({
			key,
			value: String(value),
			type: 'default',
			enabled: true
		})),
		_postman_variable_scope: 'environment'
	};
}

async function main() {
	const uri = process.env.MONGODB_URI;
	if (!uri) {
		console.error('Falta MONGODB_URI');
		process.exit(1);
	}

	await mongoose.connect(uri);

	const admin = await upsertUser(USERS.admin);
	const dueno1 = await upsertUser(USERS.dueno1);
	const dueno2 = await upsertUser(USERS.dueno2);
	const vet = await upsertUser(USERS.vet);
	const paseador = await upsertUser(USERS.paseador);
	const cuidador = await upsertUser(USERS.cuidador);

	const firulais = await ensurePet(dueno1._id, {
		name: 'Firulais',
		species: 'perro',
		breed: 'Mestizo',
		sex: 'macho',
		status: 'active'
	});
	const mishi = await ensurePet(dueno1._id, {
		name: 'Mishi',
		species: 'gato',
		breed: 'Doméstico',
		sex: 'hembra',
		status: 'active'
	});

	// dueño2 sin mascotas
	await Pet.deleteMany({ ownerId: dueno2._id });

	const clinicService = await ensureClinicService(vet._id);
	const slot = await ensureSlot(vet._id, clinicService._id);
	const appointment = await ensureCompletedAppointment({ owner: dueno1, provider: vet, pet: firulais });
	const encounter = await ensureEncounter({ pet: firulais, provider: vet, appointment });

	const env = buildQaEnvironment({
		vetId: vet._id,
		paseadorId: paseador._id,
		cuidadorId: cuidador._id,
		firulaisId: firulais._id,
		mishiId: mishi._id,
		clinicServiceId: clinicService._id,
		slotId: slot._id,
		appointmentId: appointment._id,
		encounterId: encounter._id
	});

	const outPath = path.join(__dirname, '..', 'postman', 'PetConnect-QA.postman_environment.json');
	fs.writeFileSync(outPath, JSON.stringify(env, null, 2));

	console.log('Seed QA TCP-001 listo.');
	console.log('  password (todos):', QA_PASSWORD);
	console.log('  admin:           ', admin.email);
	console.log('  dueño1:          ', dueno1.email, '· mascotas: Firulais, Mishi');
	console.log('  dueño2:          ', dueno2.email, '· sin mascotas');
	console.log('  vet:             ', vet.email);
	console.log('  paseador:        ', paseador.email);
	console.log('  cuidador:        ', cuidador.email, '(en_revision)');
	console.log('  appointmentId:   ', appointment._id.toString());
	console.log('  encounterId:     ', encounter._id.toString());
	console.log('  environment:     ', outPath);

	await mongoose.disconnect();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
