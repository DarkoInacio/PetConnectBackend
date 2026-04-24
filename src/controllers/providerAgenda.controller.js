'use strict';

const { DateTime } = require('luxon');
const AvailabilitySlot = require('../models/AvailabilitySlot');
const AgendaSlotOmit = require('../models/AgendaSlotOmit');
const User = require('../models/User');
const {
	parseHHMM,
	buildVetAgendaSlotsForCivilDay,
	listCivilDaysInRange,
	getAgendaZone,
	startOfTodayInZone
} = require('../utils/vetAgendaSlots');

async function ensureApprovedProvider(userId) {
	const provider = await User.findById(userId).select('_id role status');
	if (!provider || provider.role !== 'proveedor') {
		return { ok: false, code: 403, message: 'Solo proveedores pueden gestionar agenda' };
	}
	if (provider.status !== 'aprobado') {
		return { ok: false, code: 403, message: 'Tu perfil debe estar aprobado para publicar agenda' };
	}
	return { ok: true };
}

async function generateAgendaSlots(req, res, next) {
	try {
		const providerCheck = await ensureApprovedProvider(req.user.id);
		if (!providerCheck.ok) {
			return res.status(providerCheck.code).json({ message: providerCheck.message });
		}

		const me = await User.findById(req.user.id)
			.select('providerType providerProfile.agendaSlotStart providerProfile.agendaSlotEnd')
			.lean();
		if (!me || me.providerType !== 'veterinaria') {
			return res.status(400).json({ message: 'Solo las cuentas de veterinaria pueden generar bloques de agenda' });
		}

		const zone = getAgendaZone();
		const startStr = me.providerProfile?.agendaSlotStart || '09:00';
		const endStr = me.providerProfile?.agendaSlotEnd || '18:00';
		const sMin = parseHHMM(startStr);
		const eMin = parseHHMM(endStr);
		if (sMin == null || eMin == null) {
			return res.status(400).json({ message: 'Configura inicio y fin de agenda (HH:MM) en el perfil de clínica' });
		}
		if (eMin <= sMin) {
			return res.status(400).json({ message: 'En el perfil, la hora de fin de agenda debe ser mayor que el inicio' });
		}

		const nowZ = DateTime.now().setZone(zone);
		const todayYmd = nowZ.toFormat('yyyy-LL-dd');
		const fromDateRaw = req.body.fromDate && String(req.body.fromDate).trim() ? String(req.body.fromDate).trim() : todayYmd;
		const toDateRaw = req.body.toDate && String(req.body.toDate).trim() ? String(req.body.toDate).trim() : fromDateRaw;

		if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDateRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(toDateRaw)) {
			return res.status(400).json({ message: 'Formato de fecha inválido. Usar YYYY-MM-DD' });
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
			return res.status(400).json({ message: 'Fecha "desde" no válida' });
		}
		if (fromStart < startOfTodayInZone(zone)) {
			return res.status(400).json({ message: 'No se pueden generar bloques en fechas pasadas' });
		}

		const dayList = listCivilDaysInRange(fromDateRaw, toDateRaw, zone);
		if (dayList.length === 0) {
			return res.status(400).json({ message: 'toDate debe ser mayor o igual a fromDate' });
		}
		if (dayList.length > 31) {
			return res.status(400).json({ message: 'Solo se permite generar hasta 31 días por solicitud' });
		}

		/** Candidatos (sin los que el usuario borró a mano, guardados en AgendaSlotOmit) */
		const candidateSlots = [];
		for (const ymd of dayList) {
			const daySlots = buildVetAgendaSlotsForCivilDay(req.user.id, ymd, startStr, endStr, zone, 30);
			for (const slot of daySlots) {
				candidateSlots.push(slot);
			}
		}

		if (candidateSlots.length === 0) {
			return res.status(400).json({ message: 'No hay franjas que generar con el rango de hora actual' });
		}

		const candidateMs = candidateSlots.map((s) => s.startAt.getTime());
		const oms = await AgendaSlotOmit.find({
			providerId: req.user.id,
			startAtMs: { $in: candidateMs }
		})
			.select('startAtMs')
			.lean();
		const omittedSet = new Set(oms.map((o) => o.startAtMs));
		const toUpsert = candidateSlots.filter((s) => !omittedSet.has(s.startAt.getTime()));

		const operations = toUpsert.map((slot) => ({
			updateOne: {
				filter: { providerId: slot.providerId, startAt: slot.startAt },
				update: { $setOnInsert: slot },
				upsert: true
			}
		}));

		let result = { upsertedCount: 0, matchedCount: 0, modifiedCount: 0 };
		if (operations.length > 0) {
			result = await AvailabilitySlot.bulkWrite(operations, { ordered: false });
		}
		const generatedDays = dayList.length;
		const insertedCount = result.upsertedCount || 0;
		const totalAttempted = operations.length;
		const alreadyPresentOrNop = totalAttempted - insertedCount;
		const skippedReinsertDeleted = candidateSlots.length - toUpsert.length;

		let message;
		if (toUpsert.length === 0) {
			message =
				skippedReinsertDeleted > 0
					? 'Ningún bloque nuevo: todas esas franjas estaban suprimidas (las borraste a mano) o ya existían. Usa «Liberar franjas suprimidas» y vuelve a generar si quieres reinsertar las eliminadas.'
					: 'Ningún bloque nuevo: ya existen todas las franjas de ese rango y hora.';
		} else {
			message =
				skippedReinsertDeleted > 0
					? 'Bloques de agenda: se insertaron o conservaron franjas; no se reinsertan las que habías eliminado manualmente'
					: 'Bloques de agenda generados correctamente';
		}

		return res.status(201).json({
			message,
			summary: {
				generatedDays,
				candidates: candidateSlots.length,
				attemptedUpsert: totalAttempted,
				insertedCount,
				unchangedOrDupFilter: alreadyPresentOrNop,
				respectedManualDeletes: skippedReinsertDeleted
			}
		});
	} catch (error) {
		next(error);
	}
}

async function listMySlots(req, res, next) {
	try {
		const providerCheck = await ensureApprovedProvider(req.user.id);
		if (!providerCheck.ok) {
			return res.status(providerCheck.code).json({ message: providerCheck.message });
		}

		const query = { providerId: req.user.id };
		const { from, to, fromYmd, toYmd, onlyFuture, status } = req.query;
		if (status) {
			if (!['available', 'blocked'].includes(status)) {
				return res.status(400).json({ message: 'status invalido. Usar available o blocked' });
			}
			query.status = status;
		}

		const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
		const hasYmd = Boolean(
			(fromYmd && String(fromYmd).trim()) || (toYmd && String(toYmd).trim())
		);

		if (hasYmd) {
			const zone = getAgendaZone();
			const fy = fromYmd && String(fromYmd).trim() ? String(fromYmd).trim() : null;
			const ty = toYmd && String(toYmd).trim() ? String(toYmd).trim() : null;
			const a = fy || ty;
			const b = ty || fy;
			if (!ymdRe.test(a) || !ymdRe.test(b)) {
				return res.status(400).json({ message: 'fromYmd y toYmd deben ser YYYY-MM-DD' });
			}
			const [y1, m1, d1] = a.split('-').map((n) => parseInt(n, 10));
			const [y2, m2, d2] = b.split('-').map((n) => parseInt(n, 10));
			const startB = DateTime.fromObject(
				{ year: y1, month: m1, day: d1, hour: 0, minute: 0, second: 0, millisecond: 0 },
				{ zone }
			).startOf('day');
			const endB = DateTime.fromObject(
				{ year: y2, month: m2, day: d2, hour: 0, minute: 0, second: 0, millisecond: 0 },
				{ zone }
			).endOf('day');
			if (!startB.isValid || !endB.isValid || endB < startB) {
				return res.status(400).json({ message: 'Rango de fechas (fromYmd/toYmd) no valido' });
			}
			const startMs = startB.toJSDate().getTime();
			const endMs = endB.toJSDate().getTime();
			const wantFuture = onlyFuture !== '0' && onlyFuture !== 'false';
			const gteMs = wantFuture ? Math.max(startMs, Date.now()) : startMs;
			if (gteMs > endMs) {
				return res.status(200).json({ slots: [] });
			}
			query.startAt = { $gte: new Date(gteMs), $lte: new Date(endMs) };
		} else if (from || to) {
			query.startAt = {};
			if (from) {
				const fromDate = new Date(from);
				if (Number.isNaN(fromDate.getTime())) {
					return res.status(400).json({ message: 'from invalido. Usar fecha ISO valida' });
				}
				query.startAt.$gte = fromDate;
			}
			if (to) {
				const toDate = new Date(to);
				if (Number.isNaN(toDate.getTime())) {
					return res.status(400).json({ message: 'to invalido. Usar fecha ISO valida' });
				}
				query.startAt.$lte = toDate;
			}
			/** Sólo futuro salvo desactivar. */
			if (onlyFuture !== '0' && onlyFuture !== 'false') {
				if (!query.startAt) query.startAt = {};
				if (!query.startAt.$gte) query.startAt.$gte = new Date();
				else {
					const t = new Date(
						Math.max(query.startAt.$gte.getTime(), Date.now())
					);
					query.startAt.$gte = t;
				}
			}
		} else if (onlyFuture !== '0' && onlyFuture !== 'false') {
			/** Listado de panel: por defecto sólo bloques que aun no pasaron. */
			query.startAt = { $gte: new Date() };
		}

		const slots = await AvailabilitySlot.find(query).sort({ startAt: 1 });
		return res.status(200).json({ slots });
	} catch (error) {
		next(error);
	}
}

async function blockMySlot(req, res, next) {
	try {
		const providerCheck = await ensureApprovedProvider(req.user.id);
		if (!providerCheck.ok) {
			return res.status(providerCheck.code).json({ message: providerCheck.message });
		}

		const slot = await AvailabilitySlot.findOneAndUpdate(
			{ _id: req.params.slotId, providerId: req.user.id, status: 'available' },
			{ $set: { status: 'blocked' } },
			{ new: true }
		);
		if (!slot) {
			return res
				.status(404)
				.json({ message: 'Bloque no encontrado o no disponible para bloquear' });
		}
		return res.status(200).json({ message: 'Bloque bloqueado', slot });
	} catch (error) {
		next(error);
	}
}

async function unblockMySlot(req, res, next) {
	try {
		const providerCheck = await ensureApprovedProvider(req.user.id);
		if (!providerCheck.ok) {
			return res.status(providerCheck.code).json({ message: providerCheck.message });
		}

		const slot = await AvailabilitySlot.findOneAndUpdate(
			{ _id: req.params.slotId, providerId: req.user.id, status: 'blocked' },
			{ $set: { status: 'available' } },
			{ new: true }
		);
		if (!slot) {
			return res.status(404).json({ message: 'Bloque no encontrado o no estaba bloqueado' });
		}
		return res.status(200).json({ message: 'Bloque desbloqueado', slot });
	} catch (error) {
		next(error);
	}
}

async function deleteMySlot(req, res, next) {
	try {
		const providerCheck = await ensureApprovedProvider(req.user.id);
		if (!providerCheck.ok) {
			return res.status(providerCheck.code).json({ message: providerCheck.message });
		}

		const slot = await AvailabilitySlot.findOneAndDelete({
			_id: req.params.slotId,
			providerId: req.user.id
		});
		if (!slot) {
			return res.status(404).json({ message: 'Bloque no encontrado' });
		}
		// Al volver a "generar", no recrear este hueco a menos que se borre el registro (DELETE /omits)
		const ms = slot.startAt.getTime();
		await AgendaSlotOmit.updateOne(
			{ providerId: req.user.id, startAtMs: ms },
			{ $setOnInsert: { providerId: req.user.id, startAtMs: ms } },
			{ upsert: true }
		).catch(() => {});
		return res.status(200).json({ message: 'Bloque eliminado' });
	} catch (error) {
		next(error);
	}
}

/**
 * DELETE /api/provider/agenda/omits?from=YYYY-MM-DD&to=YYYY-MM-DD (zona AGENDA / Chile)
 * Quita el recuerdo de "franjas borradas a mano" en ese rango, para que el próximo
 * "generar" vuelva a ofrecerlas (si en el rango y hora del perfil).
 */
async function clearOmittedAgendaSlots(req, res, next) {
	try {
		const providerCheck = await ensureApprovedProvider(req.user.id);
		if (!providerCheck.ok) {
			return res.status(providerCheck.code).json({ message: providerCheck.message });
		}

		const fromRaw = req.query.from != null ? String(req.query.from).trim() : '';
		const toRaw = req.query.to != null ? String(req.query.to).trim() : fromRaw;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
			return res
				.status(400)
				.json({ message: 'Usa from y to en formato YYYY-MM-DD (zona horaria de la agenda, p. ej. Chile)' });
		}

		const zone = getAgendaZone();
		const [y1, m1, d1] = fromRaw.split('-').map((n) => parseInt(n, 10));
		const [y2, m2, d2] = toRaw.split('-').map((n) => parseInt(n, 10));
		const startZ = DateTime.fromObject({ year: y1, month: m1, day: d1, hour: 0, minute: 0, second: 0, millisecond: 0 }, { zone }).startOf('day');
		const endZ = DateTime.fromObject({ year: y2, month: m2, day: d2, hour: 0, minute: 0, second: 0, millisecond: 0 }, { zone }).endOf('day');
		if (!startZ.isValid || !endZ.isValid || endZ < startZ) {
			return res.status(400).json({ message: 'Rango de fechas no válido' });
		}

		const gte = startZ.toMillis();
		const lte = endZ.toMillis();
		const del = await AgendaSlotOmit.deleteMany({
			providerId: req.user.id,
			startAtMs: { $gte: gte, $lte: lte }
		});

		return res.status(200).json({
			message: 'Registros de franjas suprimidas eliminados; el próximo "generar" podrá recrear esos huecos',
			deletedCount: del.deletedCount || 0
		});
	} catch (error) {
		next(error);
	}
}

module.exports = {
	generateAgendaSlots,
	listMySlots,
	blockMySlot,
	unblockMySlot,
	deleteMySlot,
	clearOmittedAgendaSlots
};
