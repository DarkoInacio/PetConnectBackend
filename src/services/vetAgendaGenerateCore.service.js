'use strict';

const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const AvailabilitySlot = require('../models/AvailabilitySlot');
const AgendaSlotOmit = require('../models/AgendaSlotOmit');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const ClinicService = require('../models/ClinicService');
const { ensureDefaultClinicService } = require('../utils/clinicService.util');
const {
	parseHHMM,
	buildVetAgendaSlotsForCivilDay,
	listCivilDaysInRange,
	getAgendaZone,
	startOfTodayInZone
} = require('../utils/vetAgendaSlots');

const APPOINTMENT_BLOCKING_STATUSES = ['pending_confirmation', 'confirmed', 'completed', 'no_show'];
const MAX_DAYS_PER_REQUEST = 70;

function rangeOverlaps(aStart, aEnd, bStart, bEnd) {
	return aStart < bEnd && aEnd > bStart;
}

/**
 * El índice legado único (providerId + startAt) impide dos líneas a la misma hora. Si aún está en la BD, se
 * quita; el esquema crea (providerId + clinicServiceId + startAt) único. Reintento único de bulkWrite.
 */
async function bulkWriteSlotsWithLegacyIndexRepair(operations) {
	if (!operations || operations.length === 0) {
		return { upsertedCount: 0, matchedCount: 0, modifiedCount: 0, insertedCount: 0, deletedCount: 0 };
	}
	const run = () => AvailabilitySlot.bulkWrite(operations, { ordered: false });
	const isDup = (e) => {
		if (!e) return false;
		const m = (e.message || e.errmsg || String(e)) + '';
		return e.code === 11000 || m.includes('E11000') || m.toLowerCase().includes('duplicate key');
	};
	const repairIndexes = async () => {
		const db = mongoose.connection && mongoose.connection.db;
		if (!db) return;
		const coll = db.collection('availabilityslots');
		try {
			await coll.dropIndex('providerId_1_startAt_1');
		} catch (_) {
			/* no existe o ya reemplazado */
		}
		try {
			const ixes = await coll.indexes();
			for (const ix of ixes) {
				if (!ix.unique) continue;
				const k = ix.key || {};
				if (k.clinicServiceId != null) continue;
				if (k.providerId == null || k.startAt == null) continue;
				if (Object.keys(k).length !== 2) continue;
				try {
					await coll.dropIndex(ix.name);
				} catch (_) {
					/* */
				}
			}
		} catch (_) {
			/* */
		}
		try {
			await AvailabilitySlot.syncIndexes();
		} catch (_) {
			/* */
		}
	};
	try {
		return await run();
	} catch (e) {
		if (!isDup(e)) {
			throw e;
		}
		await repairIndexes();
		return await run();
	}
}

/**
 * Misma lógica que POST /provider/agenda/generate, reutilizable (proveedor en panel o materializar al agendar).
 * @param {import('mongoose').Types.ObjectId|string} providerId
 * @param {string} fromDateRaw YYYY-MM-DD
 * @param {string} toDateRaw YYYY-MM-DD
 * @param {{ skipTodayStartCheck?: boolean }} [opts]
 * @returns {Promise<{ ok: true, insertedCount: number, dayCount: number, message: string } | { ok: false, message: string, code?: number }>}
 */
async function runVetAgendaGenerateForProvider(providerId, fromDateRaw, toDateRaw, opts = {}) {
	if (!mongoose.Types.ObjectId.isValid(String(providerId))) {
		return { ok: false, message: 'providerId inválido' };
	}
	const pid = new mongoose.Types.ObjectId(String(providerId));

	const me = await User.findById(pid)
		.select('providerType role roles status providerProfile.agendaSlotStart providerProfile.agendaSlotEnd')
		.lean();
	if (!me || me.providerType !== 'veterinaria' || me.status !== 'aprobado') {
		return { ok: false, message: 'Clínica no disponible para generar agenda' };
	}
	const effRoles = me.roles && me.roles.length > 0 ? me.roles : [me.role];
	if (!effRoles.includes('proveedor')) {
		return { ok: false, message: 'Clínica no disponible para generar agenda' };
	}

	const zone = getAgendaZone();
	const startStr = me.providerProfile?.agendaSlotStart || '09:00';
	const endStr = me.providerProfile?.agendaSlotEnd || '18:00';
	const sMin = parseHHMM(startStr);
	const eMin = parseHHMM(endStr);
	if (sMin == null || eMin == null) {
		return { ok: false, message: 'Configura inicio y fin de agenda (HH:MM) en el perfil de clínica' };
	}
	if (eMin <= sMin) {
		return { ok: false, message: 'En el perfil, la hora de fin de agenda debe ser mayor que el inicio' };
	}

	if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDateRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(toDateRaw)) {
		return { ok: false, message: 'Formato de fecha inválido. Usar YYYY-MM-DD' };
	}

	const fromParts = fromDateRaw.split('-').map((n) => parseInt(n, 10));
	const fromStart = DateTime.fromObject(
		{
			year: fromParts[0],
			month: fromParts[1],
			day: fromParts[2],
			hour: 0,
			minute: 0,
			second: 0,
			millisecond: 0
		},
		{ zone }
	);
	if (!fromStart.isValid) {
		return { ok: false, message: 'Fecha "desde" no válida' };
	}
	if (!opts.skipTodayStartCheck && fromStart < startOfTodayInZone(zone)) {
		return { ok: false, message: 'No se pueden generar bloques en fechas pasadas' };
	}

	const dayList = listCivilDaysInRange(fromDateRaw, toDateRaw, zone);
	if (dayList.length === 0) {
		return { ok: false, message: 'toDate debe ser mayor o igual a fromDate' };
	}
	if (dayList.length > MAX_DAYS_PER_REQUEST) {
		return { ok: false, message: `Solo se permite generar hasta ${MAX_DAYS_PER_REQUEST} días por solicitud` };
	}

	let serviceDocs = await ClinicService.find({ providerId: pid, active: true }).lean();
	if (serviceDocs.length === 0) {
		const def = await ensureDefaultClinicService(pid);
		serviceDocs = [def.toObject ? def.toObject() : def];
	}

	const toUpsert = [];
	let totalCandidates = 0;
	let skippedReinsertDeleted = 0;
	let skippedConflictingAppointments = 0;

	for (const svc of serviceDocs) {
		const sid = svc._id;
		const stepMins = Math.min(180, Math.max(15, Number(svc.slotDurationMinutes) || 30));
		const candidateSlots = [];
		for (const ymd of dayList) {
			const daySlots = buildVetAgendaSlotsForCivilDay(
				pid,
				sid,
				ymd,
				startStr,
				endStr,
				zone,
				stepMins
			);
			candidateSlots.push(...daySlots);
		}
		if (candidateSlots.length === 0) continue;
		totalCandidates += candidateSlots.length;

		const candidateMs = candidateSlots.map((s) => s.startAt.getTime());
		const oms = await AgendaSlotOmit.find({
			providerId: pid,
			clinicServiceId: sid,
			startAtMs: { $in: candidateMs }
		})
			.select('startAtMs')
			.lean();
		const omittedSet = new Set(oms.map((o) => o.startAtMs));
		const afterOmit = candidateSlots.filter((s) => !omittedSet.has(s.startAt.getTime()));
		skippedReinsertDeleted += candidateSlots.length - afterOmit.length;

		const busyAppointments = await Appointment.find({
			providerId: pid,
			clinicServiceId: sid,
			status: { $in: APPOINTMENT_BLOCKING_STATUSES }
		})
			.select('startAt endAt')
			.lean();
		for (const slot of afterOmit) {
			const hasOverlap = busyAppointments.some((a) => rangeOverlaps(slot.startAt, slot.endAt, a.startAt, a.endAt));
			if (hasOverlap) {
				skippedConflictingAppointments++;
				continue;
			}
			toUpsert.push(slot);
		}
	}

	if (totalCandidates === 0) {
		return { ok: false, message: 'No hay franjas que generar con el rango de hora actual' };
	}

	const operations = toUpsert.map((slot) => ({
		updateOne: {
			filter: {
				providerId: slot.providerId,
				clinicServiceId: slot.clinicServiceId,
				startAt: slot.startAt
			},
			update: { $setOnInsert: slot },
			upsert: true
		}
	}));

	let result = { upsertedCount: 0 };
	if (operations.length > 0) {
		result = await bulkWriteSlotsWithLegacyIndexRepair(operations);
	}
	const insertedCount = result.upsertedCount || 0;

	let message;
	if (toUpsert.length === 0) {
		message = 'Ningún bloque nuevo en este rango';
	} else {
		message = insertedCount > 0 ? 'Bloques de agenda generados correctamente' : 'Bloques ya existentes en rango';
	}

	return {
		ok: true,
		insertedCount,
		dayCount: dayList.length,
		message,
		lines: serviceDocs.length,
		candidates: totalCandidates,
		attemptedUpsert: toUpsert.length
	};
}

module.exports = {
	runVetAgendaGenerateForProvider,
	MAX_DAYS_PER_REQUEST
};
