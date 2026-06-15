'use strict';

const { DateTime } = require('luxon');
const User = require('../../src/models/User');
const Pet = require('../../src/models/Pet');
const Appointment = require('../../src/models/Appointment');
const ClinicalEncounter = require('../../src/models/ClinicalEncounter');
const ClinicService = require('../../src/models/ClinicService');
const AvailabilitySlot = require('../../src/models/AvailabilitySlot');
const { signToken } = require('../../src/utils/jwt');

const AGENDA_ZONE = process.env.AGENDA_TIMEZONE || 'America/Santiago';

const DEFAULT_PASSWORD = 'Test1234!';

/**
 * Crea un usuario en BD con contraseña hasheada vía el hook del modelo.
 */
async function createUser(overrides = {}) {
	const role = overrides.role || 'dueno';
	const email =
		overrides.email ||
		`user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.petconnect.local`;

	const data = {
		name: 'Test',
		lastName: 'User',
		email,
		password: DEFAULT_PASSWORD,
		role,
		roles: overrides.roles ?? [role],
		status: overrides.status ?? (role === 'proveedor' ? 'aprobado' : 'activo'),
		...overrides
	};

	return User.create(data);
}

async function createOwner(overrides = {}) {
	return createUser({ role: 'dueno', status: 'activo', ...overrides });
}

async function createAdmin(overrides = {}) {
	return createUser({ role: 'admin', status: 'activo', roles: ['admin'], ...overrides });
}

async function createProvider(overrides = {}) {
	return createUser({
		role: 'proveedor',
		status: 'aprobado',
		providerType: 'veterinaria',
		roles: ['proveedor'],
		providerProfile: { isPublished: true, description: 'Clínica de prueba' },
		...overrides
	});
}

/** Veterinaria con ventana de agenda 09:00–18:00 (Chile). */
async function createPendingProvider(overrides = {}) {
	return createUser({
		role: 'proveedor',
		status: 'en_revision',
		providerType: 'cuidador',
		roles: ['proveedor'],
		providerProfile: {
			description: 'Proveedor pendiente de revisión',
			isPublished: false
		},
		...overrides
	});
}

async function createWalkerProvider(overrides = {}) {
	return createUser({
		role: 'proveedor',
		status: 'aprobado',
		providerType: 'paseador',
		roles: ['proveedor'],
		providerProfile: {
			isPublished: true,
			description: 'Paseador de prueba',
			address: {
				city: 'Santiago',
				commune: 'Providencia',
				coordinates: { lat: -33.4489, lng: -70.6693 }
			},
			weeklyAvailability: [
				{ day: 'monday', enabled: true, ranges: [{ start: '09:00', end: '18:00' }] }
			]
		},
		...overrides
	});
}

async function createVetProvider(overrides = {}) {
	const baseProfile = {
		isPublished: true,
		description: 'Clínica de prueba',
		agendaSlotStart: '09:00',
		agendaSlotEnd: '18:00',
		address: {
			city: 'Santiago',
			commune: 'Providencia',
			coordinates: { lat: -33.4489, lng: -70.6693 }
		}
	};
	return createProvider({
		providerProfile: { ...baseProfile, ...(overrides.providerProfile || {}) },
		...overrides
	});
}

async function createClinicService(provider, overrides = {}) {
	const existing = await ClinicService.findOne({
		providerId: provider._id,
		displayName: overrides.displayName || 'Consulta general'
	});
	if (existing) return existing;

	return ClinicService.create({
		providerId: provider._id,
		displayName: 'Consulta general',
		kind: 'consulta',
		slotDurationMinutes: 30,
		active: true,
		...overrides
	});
}

/** Slot disponible mañana 10:00–10:30 (hora Chile), dentro de ventana de recepción. */
async function createAvailableSlot({ provider, clinicService, dayOffset = 1 }) {
	const start = DateTime.now()
		.setZone(AGENDA_ZONE)
		.plus({ days: dayOffset })
		.set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
	const end = start.plus({ minutes: 30 });

	return AvailabilitySlot.create({
		providerId: provider._id,
		clinicServiceId: clinicService._id,
		startAt: start.toJSDate(),
		endAt: end.toJSDate(),
		status: 'available'
	});
}

/** Escenario listo para agendar: dueño + vet + mascota + servicio + slot. */
/** Cita completada (elegible para reseña). */
async function createCompletedAppointment({ owner, provider, pet, overrides = {} }) {
	const now = Date.now();
	return Appointment.create({
		ownerId: owner._id,
		providerId: provider._id,
		petId: pet._id,
		bookingSource: 'walker_request',
		startAt: new Date(now - 3 * 60 * 60 * 1000),
		endAt: new Date(now - 2 * 60 * 60 * 1000),
		status: 'completed',
		reason: 'Cita completada test',
		...overrides
	});
}

async function createBookingScenario({ owner: existingOwner } = {}) {
	const owner = existingOwner || (await createOwner());
	const provider = await createVetProvider();
	const pet = await createPet(owner);
	const clinicService = await createClinicService(provider);
	const slot = await createAvailableSlot({ provider, clinicService });
	return { owner, provider, pet, clinicService, slot };
}

function buildAuthHeader(user) {
	const token = signToken({ id: user._id, role: user.role });
	return { Authorization: `Bearer ${token}` };
}

async function createPet(owner, overrides = {}) {
	return Pet.create({
		ownerId: owner._id,
		name: 'Firulais',
		species: 'perro',
		breed: 'Mestizo',
		sex: 'macho',
		color: 'cafe',
		status: 'active',
		...overrides
	});
}

/**
 * Cita confirmada/completada para que un veterinario tenga acceso a la mascota.
 */
async function createConfirmedAppointment({ owner, provider, pet, overrides = {} }) {
	const now = Date.now();
	const startAt = overrides.startAt || new Date(now - 60 * 60 * 1000);
	const endAt = overrides.endAt || new Date(now - 30 * 60 * 1000);

	return Appointment.create({
		ownerId: owner._id,
		providerId: provider._id,
		petId: pet._id,
		bookingSource: 'walker_request',
		startAt,
		endAt,
		status: 'confirmed',
		reason: 'Consulta de prueba',
		...overrides
	});
}

/** Cita en ventana de edición clínica (durante el bloque o hasta 2h después). */
async function createEditableAppointment({ owner, provider, pet, overrides = {} }) {
	const now = Date.now();
	return createConfirmedAppointment({
		owner,
		provider,
		pet,
		startAt: new Date(now - 30 * 60 * 1000),
		endAt: new Date(now + 30 * 60 * 1000),
		...overrides
	});
}

async function createClinicalEncounter({ pet, provider, appointment, ...overrides }) {
	return ClinicalEncounter.create({
		petId: pet._id,
		providerId: provider._id,
		appointmentId: appointment._id,
		type: 'consulta',
		occurredAt: appointment.startAt,
		motivo: 'Consulta de prueba',
		diagnostico: 'Estado general bueno',
		tratamiento: 'Reposo',
		signedAt: new Date(),
		signedByName: 'Dr. Test Veterinaria',
		...overrides
	});
}

module.exports = {
	DEFAULT_PASSWORD,
	createUser,
	createOwner,
	createAdmin,
	createProvider,
	createVetProvider,
	createWalkerProvider,
	createPendingProvider,
	createCompletedAppointment,
	createClinicService,
	createAvailableSlot,
	createBookingScenario,
	createPet,
	createConfirmedAppointment,
	createEditableAppointment,
	createClinicalEncounter,
	buildAuthHeader
};
