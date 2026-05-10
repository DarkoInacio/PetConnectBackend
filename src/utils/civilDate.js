'use strict';

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Entrada `YYYY-MM-DD` (p. ej. de FormData / type=date) como `Date` a mediodía UTC
 * (mismo día civil al serializar a ISO y al mostrarse con componentes en UTC o timeZone
 * UTC en el cliente; evita 25-09 visto como 24-09 en America/Santiago).
 * Otros textos: `new Date(s)`.
 * @param {string} raw
 * @returns {Date | null} null = inválido; usar solo si había un valor
 */
function parseCivilYmdToStoredDate(raw) {
	const t = String(raw).trim();
	if (!t) return null;
	const m = t.match(YMD);
	if (m) {
		const y = parseInt(m[1], 10);
		const mo = parseInt(m[2], 10);
		const d = parseInt(m[3], 10);
		if (Number.isNaN(y) || Number.isNaN(mo) || Number.isNaN(d)) {
			return null;
		}
		return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
	}
	const asDate = new Date(t);
	return Number.isNaN(asDate.getTime()) ? null : asDate;
}

module.exports = { parseCivilYmdToStoredDate };
