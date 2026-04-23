'use strict';

const { DateTime } = require('luxon');

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/**
 * @param {string} s
 * @returns {number | null} minutos desde medianoche
 */
function parseHHMM(s) {
	const t = String(s || '').trim();
	const m = t.match(TIME_RE);
	if (!m) return null;
	return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Día civil YYYY-MM-DD + ventana en zona horaria → instantes reales (UTC al guardar en DB).
 * @param {import('mongoose').Types.ObjectId} providerId
 * @param {string} ymd - YYYY-MM-DD (día local en `zone`, no UTC)
 * @param {string} startStr
 * @param {string} endStr
 * @param {string} zone - IANA, p. ej. America/Santiago
 * @param {number} stepMins
 * @returns {{ providerId, startAt: Date, endAt: Date, status: string }[]}
 */
function buildVetAgendaSlotsForCivilDay(providerId, ymd, startStr, endStr, zone, stepMins = 30) {
	const defStart = 9 * 60;
	const defEnd = 18 * 60;
	const startMin = parseHHMM(startStr) ?? defStart;
	const endMin = parseHHMM(endStr) ?? defEnd;
	if (endMin <= startMin) {
		return [];
	}

	const [y, mo, d] = ymd.split('-').map((n) => parseInt(n, 10));
	if (Number.isNaN(y) || Number.isNaN(mo) || Number.isNaN(d)) {
		return [];
	}

	const dayStart = DateTime.fromObject(
		{ year: y, month: mo, day: d, hour: 0, minute: 0, second: 0, millisecond: 0 },
		{ zone }
	);
	if (!dayStart.isValid) {
		return [];
	}

	const slots = [];
	for (let minutes = startMin; minutes + stepMins <= endMin; minutes += stepMins) {
		const sh = Math.floor(minutes / 60);
		const smin = minutes % 60;
		const em = minutes + stepMins;
		const eh = Math.floor(em / 60);
		const emin = em % 60;

		const startAt = dayStart.set({ hour: sh, minute: smin, second: 0, millisecond: 0 });
		const endAt = dayStart.set({ hour: eh, minute: emin, second: 0, millisecond: 0 });

		if (!startAt.isValid || !endAt.isValid) continue;

		slots.push({
			providerId,
			startAt: startAt.toJSDate(),
			endAt: endAt.toJSDate(),
			status: 'available'
		});
	}
	return slots;
}

/**
 * Días YYYY-MM-DD (incl.) en la misma franja; las fechas son el día "civil" en `zone` (p. ej. formulario con hora local Chile).
 * @param {string} fromYmd
 * @param {string} toYmd
 * @param {string} zone
 * @returns {string[]}
 */
function listCivilDaysInRange(fromYmd, toYmd, zone) {
	const [y1, m1, d1] = fromYmd.split('-').map((n) => parseInt(n, 10));
	const [y2, m2, d2] = toYmd.split('-').map((n) => parseInt(n, 10));
	const cur0 = DateTime.fromObject(
		{ year: y1, month: m1, day: d1, hour: 0, minute: 0, second: 0, millisecond: 0 },
		{ zone }
	);
	const end = DateTime.fromObject(
		{ year: y2, month: m2, day: d2, hour: 0, minute: 0, second: 0, millisecond: 0 },
		{ zone }
	);
	if (!cur0.isValid || !end.isValid || end < cur0) {
		return [];
	}
	const out = [];
	let cur = cur0;
	for (let i = 0; i < 62 && cur <= end; i++) {
		out.push(cur.toFormat('yyyy-LL-dd'));
		cur = cur.plus({ days: 1 });
	}
	return out;
}

function getAgendaZone() {
	return (process.env.AGENDA_TIMEZONE || 'America/Santiago').trim() || 'America/Santiago';
}

/**
 * "Hoy" a medianoche en la misma zona (para no permitir fechas pasadas).
 * @param {string} zone
 * @returns {import('luxon').DateTime}
 */
function startOfTodayInZone(zone) {
	return DateTime.now().setZone(zone).startOf('day');
}

module.exports = {
	parseHHMM,
	buildVetAgendaSlotsForCivilDay,
	listCivilDaysInRange,
	getAgendaZone,
	startOfTodayInZone
};
