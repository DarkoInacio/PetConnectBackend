/**
 * Datos semilla idempotentes para smoke tests Postman/Newman.
 * Credenciales alineadas con postman/PetConnect-Local.postman_environment.json
 *
 * Uso: node scripts/seed-smoke.js
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Pet = require('../src/models/Pet');
const ClinicService = require('../src/models/ClinicService');
const AvailabilitySlot = require('../src/models/AvailabilitySlot');
const Appointment = require('../src/models/Appointment');

const SMOKE_OWNER = {
	email: process.env.SMOKE_OWNER_EMAIL || 'smoke.qa@test.com',
	password: process.env.SMOKE_OWNER_PASSWORD || 'SmokeTest2026!',
	name: 'Smoke',
	lastName: 'QA'
};

const SMOKE_VET = {
	email: process.env.SMOKE_VET_EMAIL || 'vet@prueba.cl',
	password: process.env.SMOKE_VET_PASSWORD || 'prueba123',
	name: 'Vet',
	lastName: 'Prueba'
};

const SANTIAGO = { lat: -33.4489, lng: -70.6693 };

async function upsertUser({ email, password, name, lastName, role, roles, providerType, providerProfile, status }) {
	const normalized = String(email).toLowerCase().trim();
	let user = await User.findOne({ email: normalized }).select('+password');
	if (user) {
		user.name = name;
		user.lastName = lastName;
		user.role = role;
		user.roles = roles;
		user.status = status;
		user.providerType = providerType ?? null;
		if (providerProfile) user.providerProfile = providerProfile;
		user.password = password;
		await user.save();
		return user;
	}
	return User.create({
		name,
		lastName,
		email: normalized,
		password,
		role,
		roles,
		status,
		providerType: providerType ?? null,
		providerProfile
	});
}

async function ensureSmokeSlot(providerId, clinicServiceId) {
	const now = Date.now();
	const startAt = new Date(now + 2 * 60 * 60 * 1000);
	const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);

	await AvailabilitySlot.deleteMany({
		providerId,
		clinicServiceId,
		status: 'available',
		startAt: { $gte: new Date() }
	});

	return AvailabilitySlot.create({
		providerId,
		clinicServiceId,
		startAt,
		endAt,
		status: 'available'
	});
}

function buildCiEnvironment({ providerId, petId, clinicServiceId }) {
	const port = process.env.PORT || 3000;
	const baseHost = process.env.SMOKE_BASE_HOST || `http://localhost:${port}`;

	return {
		id: 'ci-smoke-env',
		name: 'PetConnect - CI',
		values: [
			{ key: 'baseUrl', value: `${baseHost}/api`, type: 'default', enabled: true },
			{ key: 'healthUrl', value: `${baseHost}/health`, type: 'default', enabled: true },
			{ key: 'email_dueno', value: SMOKE_OWNER.email, type: 'default', enabled: true },
			{ key: 'password_dueno', value: SMOKE_OWNER.password, type: 'default', enabled: true },
			{ key: 'email_vet', value: SMOKE_VET.email, type: 'default', enabled: true },
			{ key: 'password_vet', value: SMOKE_VET.password, type: 'default', enabled: true },
			{ key: 'providerId', value: String(providerId), type: 'default', enabled: true },
			{ key: 'providerUserId', value: String(providerId), type: 'default', enabled: true },
			{ key: 'petId', value: String(petId), type: 'default', enabled: true },
			{ key: 'clinicServiceId', value: String(clinicServiceId), type: 'default', enabled: true },
			{ key: 'mapLat', value: String(SANTIAGO.lat), type: 'default', enabled: true },
			{ key: 'mapLng', value: String(SANTIAGO.lng), type: 'default', enabled: true },
			{ key: 'mapRadioKm', value: '15', type: 'default', enabled: true },
			{ key: 'token_dueno', value: '', type: 'default', enabled: true },
			{ key: 'token_vet', value: '', type: 'default', enabled: true },
			{ key: 'slotId', value: '', type: 'default', enabled: true },
			{ key: 'appointmentId', value: '', type: 'default', enabled: true }
		],
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

	const owner = await upsertUser({
		...SMOKE_OWNER,
		role: 'dueno',
		roles: ['dueno'],
		status: 'activo'
	});

	const vet = await upsertUser({
		...SMOKE_VET,
		role: 'proveedor',
		roles: ['proveedor'],
		providerType: 'veterinaria',
		status: 'aprobado',
		providerProfile: {
			description: 'Clínica veterinaria smoke QA',
			isPublished: true,
			publicSlug: 'vet-prueba-smoke',
			address: {
				street: 'Av. Providencia 100',
				commune: 'Providencia',
				city: 'Santiago',
				coordinates: SANTIAGO
			},
			agendaSlotStart: '09:00',
			agendaSlotEnd: '18:00'
		}
	});

	let pet = await Pet.findOne({ ownerId: owner._id, name: 'Luna Smoke' });
	if (!pet) {
		pet = await Pet.create({
			ownerId: owner._id,
			name: 'Luna Smoke',
			species: 'perro',
			breed: 'Mestizo',
			sex: 'hembra',
			status: 'active'
		});
	} else if (pet.status !== 'active') {
		pet.status = 'active';
		pet.deceasedAt = null;
		await pet.save();
	}

	let clinicService = await ClinicService.findOne({ providerId: vet._id, displayName: 'Consulta general' });
	if (!clinicService) {
		clinicService = await ClinicService.create({
			providerId: vet._id,
			displayName: 'Consulta general',
			kind: 'consulta',
			slotDurationMinutes: 30,
			active: true
		});
	}

	const slot = await ensureSmokeSlot(vet._id, clinicService._id);

	// Libera citas smoke previas que bloqueen slots en re-ejecuciones locales
	await Appointment.deleteMany({
		ownerId: owner._id,
		providerId: vet._id,
		reason: { $regex: /Smoke test/i }
	});

	const env = buildCiEnvironment({
		providerId: vet._id,
		petId: pet._id,
		clinicServiceId: clinicService._id
	});

	const outPath = path.join(__dirname, '..', 'postman', 'PetConnect-CI.postman_environment.json');
	fs.writeFileSync(outPath, JSON.stringify(env, null, 2));

	console.log('Smoke seed listo.');
	console.log('  dueño:          ', SMOKE_OWNER.email);
	console.log('  veterinaria:    ', SMOKE_VET.email);
	console.log('  providerId:     ', vet._id.toString());
	console.log('  petId:          ', pet._id.toString());
	console.log('  clinicServiceId:', clinicService._id.toString());
	console.log('  slotId (nuevo): ', slot._id.toString());
	console.log('  environment:    ', outPath);

	await mongoose.disconnect();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
