'use strict';

const mongoose = require('mongoose');
const AvailabilitySlot = require('../models/AvailabilitySlot');
const User = require('../models/User');
const { isProveedorAprobado, normalizeAccountStatus } = require('../utils/providerEligibility');
const {
	todayYmdChile,
	addCalendarDaysYmd,
	diffInclusiveDaysYmd,
	buildDaySlotsChileWall,
	chileWallCivilDayBounds,
	normalizeWallHm,
	wallMinutesFromHm,
	filterSlotsByVetAgendaWindow
} = require('../utils/chileCalendar');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function providerIdInQuery(userId) {
	const s = String(userId);
	return { $in: [new mongoose.Types.ObjectId(s), s] };
}

async function ensureApprovedProvider(userId) {
	const provider = await User.findById(userId).select('_id role status providerType');
	if (!provider || provider.role !== 'proveedor') {
		return {
			ok: false,
			code: 403,
			message:
				'Solo cuentas con rol de proveedor pueden gestionar la agenda. Si usas la misma cuenta como dueño y como clínica, inicia sesión con el correo registrado como proveedor o pide a un administrador que verifique tu rol en la base de datos.'
		};
	}
	if (!isProveedorAprobado(provider)) {
		const st = provider.status;
		const norm = normalizeAccountStatus(st);
		return {
			ok: false,
			code: 403,
			message:
				norm === 'en_revision'
					? 'Tu perfil de proveedor sigue en revisión. Cuando un administrador lo apruebe, podrás publicar franjas en la agenda.'
					: norm === 'rechazado'
						? 'Tu solicitud de proveedor fue rechazada; no puedes publicar agenda.'
						: `Tu perfil debe estar aprobado para publicar agenda. Estado actual en el sistema: "${st ?? 'sin estado'}". Si un administrador ya te aprobó, pide que revisen el campo status del usuario (debe ser exactamente aprobado) o vuelve a iniciar sesión tras la aprobación.`
		};
	}
	return { ok: true };
}

async function generateAgendaSlots(req, res, next) {
	try {
		const providerCheck = await ensureApprovedProvider(req.user.id);
		if (!providerCheck.ok) {
			return res.status(providerCheck.code).json({ message: providerCheck.message });
		}

		const todayStr = todayYmdChile();
		const fromDateRaw = req.body.fromDate || todayStr;
		const toDateRaw = req.body.toDate || fromDateRaw;

		if (!DATE_RE.test(fromDateRaw) || !DATE_RE.test(toDateRaw)) {
			return res.status(400).json({ message: 'Formato de fecha invalido. Usar YYYY-MM-DD' });
		}
		if (fromDateRaw > toDateRaw) {
			return res.status(400).json({ message: 'toDate debe ser mayor o igual a fromDate' });
		}
		if (fromDateRaw < todayStr) {
			return res.status(400).json({ message: 'No se pueden generar bloques en fechas pasadas' });
		}

		const days = diffInclusiveDaysYmd(fromDateRaw, toDateRaw);
		// El panel pide «hoy + 8 semanas» (~57 días); 31 era demasiado bajo y devolvía 400 sin crear tramos.
		if (days > 120) {
			return res.status(400).json({ message: 'Solo se permite generar hasta 120 dias por solicitud' });
		}

		const providerRow = await User.findById(req.user.id)
			.select('providerProfile.agendaSlotStart providerProfile.agendaSlotEnd')
			.lean();
		const pp = providerRow?.providerProfile || {};
		const slotStartHm = normalizeWallHm(pp.agendaSlotStart, '09:00');
		const slotEndHm = normalizeWallHm(pp.agendaSlotEnd, '18:00');
		if (wallMinutesFromHm(slotEndHm) <= wallMinutesFromHm(slotStartHm)) {
			return res.status(400).json({
				message:
					'Revisa en Mi perfil el horario de recepción (apertura y cierre): el cierre debe ser después de la apertura el mismo día.'
			});
		}

		const providerOid = new mongoose.Types.ObjectId(String(req.user.id));
		const operations = [];
		for (let i = 0; i < days; i++) {
			const ymd = addCalendarDaysYmd(fromDateRaw, i);
			const daySlots = buildDaySlotsChileWall(ymd, providerOid, {
				slotStart: slotStartHm,
				slotEnd: slotEndHm,
				slotStepMinutes: 30
			});
			for (const slot of daySlots) {
				operations.push({
					updateOne: {
						filter: { providerId: slot.providerId, startAt: slot.startAt },
						update: { $setOnInsert: slot },
						upsert: true
					}
				});
			}
		}

		const result = await AvailabilitySlot.bulkWrite(operations, { ordered: false });
		const generatedDays = days;
		const insertedCount = result.upsertedCount || 0;
		const totalAttempted = operations.length;
		const existingCount = totalAttempted - insertedCount;

		return res.status(201).json({
			message: 'Bloques de agenda generados correctamente',
			summary: {
				generatedDays,
				totalAttempted,
				insertedCount,
				existingCount
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

		const query = { providerId: providerIdInQuery(req.user.id) };
		const { from, to, status } = req.query;
		const onlyFuture = String(req.query.onlyFuture || '');
		const fromYmd = req.query.fromYmd ? String(req.query.fromYmd) : '';
		const toYmd = req.query.toYmd ? String(req.query.toYmd) : '';

		if (status) {
			if (!['available', 'blocked'].includes(status)) {
				return res.status(400).json({ message: 'status invalido. Usar available o blocked' });
			}
			query.status = status;
		}

		if (from || to) {
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
		} else if (DATE_RE.test(fromYmd) && DATE_RE.test(toYmd)) {
			const a = chileWallCivilDayBounds(fromYmd).dayStart;
			const b = chileWallCivilDayBounds(toYmd).dayEnd;
			const now = new Date();
			const lo =
				onlyFuture === '1' || onlyFuture === 'true'
					? new Date(Math.max(a.getTime(), now.getTime()))
					: a;
			query.startAt = { $gte: lo, $lte: b };
		} else if (onlyFuture === '1' || onlyFuture === 'true') {
			query.startAt = { $gte: new Date() };
		}

		let slots = await AvailabilitySlot.find(query).sort({ startAt: 1 }).lean();
		const me = await User.findById(req.user.id)
			.select('providerType providerProfile.agendaSlotStart providerProfile.agendaSlotEnd')
			.lean();
		if (String(me?.providerType) === 'veterinaria') {
			const pp = me.providerProfile || {};
			slots = filterSlotsByVetAgendaWindow(slots, pp.agendaSlotStart, pp.agendaSlotEnd);
		}
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
			{ _id: req.params.slotId, providerId: providerIdInQuery(req.user.id), status: 'available' },
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
			{ _id: req.params.slotId, providerId: providerIdInQuery(req.user.id), status: 'blocked' },
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
			providerId: providerIdInQuery(req.user.id)
		});
		if (!slot) {
			return res.status(404).json({ message: 'Bloque no encontrado' });
		}
		return res.status(200).json({ message: 'Bloque eliminado' });
	} catch (error) {
		next(error);
	}
}

module.exports = {
	generateAgendaSlots,
	listMySlots,
	blockMySlot,
	unblockMySlot,
	deleteMySlot
};
