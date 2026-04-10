'use strict';

const AvailabilitySlot = require('../models/AvailabilitySlot');
const User = require('../models/User');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseYmdDate(value) {
	if (!DATE_RE.test(value)) return null;
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}
	return date;
}

function formatYmdUtc(date) {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

function addDaysUtc(date, days) {
	const copy = new Date(date.getTime());
	copy.setUTCDate(copy.getUTCDate() + days);
	return copy;
}

function buildDaySlotsUtc(dayDateUtc, providerId) {
	const slots = [];
	for (let minutes = 9 * 60; minutes < 18 * 60; minutes += 30) {
		const startHour = Math.floor(minutes / 60);
		const startMinute = minutes % 60;
		const endMinutes = minutes + 30;
		const endHour = Math.floor(endMinutes / 60);
		const endMinute = endMinutes % 60;

		const startAt = new Date(
			Date.UTC(
				dayDateUtc.getUTCFullYear(),
				dayDateUtc.getUTCMonth(),
				dayDateUtc.getUTCDate(),
				startHour,
				startMinute,
				0,
				0
			)
		);
		const endAt = new Date(
			Date.UTC(
				dayDateUtc.getUTCFullYear(),
				dayDateUtc.getUTCMonth(),
				dayDateUtc.getUTCDate(),
				endHour,
				endMinute,
				0,
				0
			)
		);
		slots.push({ providerId, startAt, endAt, status: 'available' });
	}
	return slots;
}

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

		const todayUtc = new Date();
		const today = new Date(
			Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate())
		);

		const fromDateRaw = req.body.fromDate || formatYmdUtc(today);
		const toDateRaw = req.body.toDate || fromDateRaw;

		const fromDate = parseYmdDate(fromDateRaw);
		const toDate = parseYmdDate(toDateRaw);
		if (!fromDate || !toDate) {
			return res.status(400).json({ message: 'Formato de fecha invalido. Usar YYYY-MM-DD' });
		}
		if (toDate < fromDate) {
			return res.status(400).json({ message: 'toDate debe ser mayor o igual a fromDate' });
		}
		if (fromDate < today) {
			return res.status(400).json({ message: 'No se pueden generar bloques en fechas pasadas' });
		}

		const days = Math.floor((toDate - fromDate) / (24 * 60 * 60 * 1000)) + 1;
		if (days > 31) {
			return res.status(400).json({ message: 'Solo se permite generar hasta 31 dias por solicitud' });
		}

		const operations = [];
		for (let i = 0; i < days; i++) {
			const day = addDaysUtc(fromDate, i);
			const daySlots = buildDaySlotsUtc(day, req.user.id);
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

		const query = { providerId: req.user.id };
		const { from, to, status } = req.query;
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
