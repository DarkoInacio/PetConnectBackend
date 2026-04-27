'use strict';

const CL_TZ = 'America/Santiago';

/**
 * Chile continental sin DST desde 2016: fijamos -03:00 para armar instantes de "reloj de pared" local.
 * (Misma idea que el front en constants/chileTime.)
 */
const CHILE_WALL_ISO_OFFSET = '-03:00';

/**
 * Fecha local Chile como YYYY-MM-DD (para alinear agenda con el front).
 * @returns {string}
 */
function todayYmdChile() {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: CL_TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(new Date());
	const y = parts.find((p) => p.type === 'year').value;
	const m = parts.find((p) => p.type === 'month').value;
	const d = parts.find((p) => p.type === 'day').value;
	return `${y}-${m}-${d}`;
}

/**
 * @param {Date|string|number} when
 * @returns {string} YYYY-MM-DD en calendario Chile
 */
function formatYmdInChile(when) {
	const d = when instanceof Date ? when : new Date(when);
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: CL_TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(d);
	const y = parts.find((p) => p.type === 'year').value;
	const m = parts.find((p) => p.type === 'month').value;
	const day = parts.find((p) => p.type === 'day').value;
	return `${y}-${m}-${day}`;
}

/**
 * Suma días a un YYYY-MM-DD (calendario gregoriano, mediodía UTC para evitar bordes).
 * @param {string} ymd
 * @param {number} deltaDays
 * @returns {string}
 */
function addCalendarDaysYmd(ymd, deltaDays) {
	const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
	if (!DATE_RE.test(ymd)) return ymd;
	const [y, mo, d] = ymd.split('-').map(Number);
	const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
	dt.setUTCDate(dt.getUTCDate() + deltaDays);
	const yy = dt.getUTCFullYear();
	const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(dt.getUTCDate()).padStart(2, '0');
	return `${yy}-${mm}-${dd}`;
}

/**
 * Días inclusivos entre dos YYYY-MM-DD (ordenados).
 * @param {string} fromYmd
 * @param {string} toYmd
 * @returns {number}
 */
function diffInclusiveDaysYmd(fromYmd, toYmd) {
	const [y1, m1, d1] = fromYmd.split('-').map(Number);
	const [y2, m2, d2] = toYmd.split('-').map(Number);
	const a = Date.UTC(y1, m1 - 1, d1);
	const b = Date.UTC(y2, m2 - 1, d2);
	return Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1;
}

const WALL_HM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/**
 * Hora HH:MM (24 h) desde texto; null si no es válida.
 * @param {unknown} raw
 * @returns {string | null}
 */
function parseWallHmStrict(raw) {
	if (raw == null) return null;
	const s = String(raw).trim();
	if (!s) return null;
	const m = WALL_HM_RE.exec(s);
	if (!m) return null;
	const h = String(Number(m[1])).padStart(2, '0');
	return `${h}:${m[2]}`;
}

/**
 * @param {unknown} raw
 * @param {string} fallback HH:MM
 */
function normalizeWallHm(raw, fallback) {
	const p = parseWallHmStrict(raw);
	return p || fallback;
}

/** Minutos desde medianoche (mismo día civil). */
function wallMinutesFromHm(hm) {
	const [h, mm] = hm.split(':').map(Number);
	return h * 60 + mm;
}

/**
 * Tramos consecutivos en reloj de pared Chile (-03:00) para un día civil YYYY-MM-DD.
 * @param {string} ymd
 * @param {import('mongoose').Types.ObjectId|string} providerId
 * @param {{ slotStart?: string, slotEnd?: string, slotStepMinutes?: number }} [opts]
 * @returns {{ providerId: import('mongoose').Types.ObjectId|string, startAt: Date, endAt: Date, status: string }[]}
 */
function buildDaySlotsChileWall(ymd, providerId, opts = {}) {
	const slotStepMinutes = Math.min(120, Math.max(5, Number(opts.slotStepMinutes) || 30));
	const startHm = normalizeWallHm(opts.slotStart, '09:00');
	const endHm = normalizeWallHm(opts.slotEnd, '18:00');
	const dayClose = new Date(`${ymd}T${endHm}:00${CHILE_WALL_ISO_OFFSET}`);
	let t = new Date(`${ymd}T${startHm}:00${CHILE_WALL_ISO_OFFSET}`);
	if (!(dayClose.getTime() > t.getTime())) {
		return [];
	}
	const stepMs = slotStepMinutes * 60 * 1000;
	const slots = [];
	while (t.getTime() + stepMs <= dayClose.getTime()) {
		const startAt = new Date(t);
		const endAt = new Date(t.getTime() + stepMs);
		slots.push({ providerId, startAt, endAt, status: 'available' });
		t = endAt;
	}
	return slots;
}

/**
 * Tramo totalmente dentro de [startHm, endHm] en el día civil Chile del inicio (muro -03:00).
 * @param {{ startAt: Date|string|number, endAt: Date|string|number }} slot
 * @param {string} startHm HH:MM ya normalizado
 * @param {string} endHm HH:MM ya normalizado
 */
function slotWithinChileAgendaWall(slot, startHm, endHm) {
	const ymd = formatYmdInChile(slot.startAt);
	if (!ymd) return false;
	const open = new Date(`${ymd}T${startHm}:00${CHILE_WALL_ISO_OFFSET}`);
	const close = new Date(`${ymd}T${endHm}:00${CHILE_WALL_ISO_OFFSET}`);
	const t0 = new Date(slot.startAt).getTime();
	const t1 = new Date(slot.endAt).getTime();
	return t0 >= open.getTime() && t1 <= close.getTime();
}

/**
 * Oculta tramos fuera del horario de recepción (p. ej. datos viejos o inconsistencias).
 * @param {Array<{ startAt: Date|string, endAt: Date|string }>} slots
 * @param {unknown} startHm perfil agendaSlotStart
 * @param {unknown} endHm perfil agendaSlotEnd
 */
function filterSlotsByVetAgendaWindow(slots, startHm, endHm) {
	const st = normalizeWallHm(startHm, '09:00');
	const en = normalizeWallHm(endHm, '18:00');
	if (wallMinutesFromHm(en) <= wallMinutesFromHm(st)) {
		return [];
	}
	const list = Array.isArray(slots) ? slots : [];
	return list.filter((s) => slotWithinChileAgendaWall(s, st, en));
}

/**
 * Inicio y fin UTC del día civil Y-M-D en el mismo reloj de pared que buildDaySlotsChileWall (-03:00).
 * @param {string} ymd YYYY-MM-DD
 * @returns {{ dayStart: Date, dayEnd: Date }}
 */
function chileWallCivilDayBounds(ymd) {
	const dayStart = new Date(`${ymd}T00:00:00${CHILE_WALL_ISO_OFFSET}`);
	const dayEnd = new Date(`${ymd}T23:59:59.999${CHILE_WALL_ISO_OFFSET}`);
	return { dayStart, dayEnd };
}

module.exports = {
	todayYmdChile,
	formatYmdInChile,
	addCalendarDaysYmd,
	diffInclusiveDaysYmd,
	buildDaySlotsChileWall,
	chileWallCivilDayBounds,
	parseWallHmStrict,
	normalizeWallHm,
	wallMinutesFromHm,
	slotWithinChileAgendaWall,
	filterSlotsByVetAgendaWindow,
	CL_TZ,
	CHILE_WALL_ISO_OFFSET
};
