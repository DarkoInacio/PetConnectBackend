'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const ClinicService = require('../models/ClinicService');
const { isProveedorAprobado } = require('../utils/providerEligibility');

async function assertProveedorActivo(userId) {
	const u = await User.findById(userId).select('role status providerType');
	if (!u || u.role !== 'proveedor') {
		return { ok: false, code: 403, message: 'Solo proveedores pueden gestionar líneas de servicio' };
	}
	if (!isProveedorAprobado(u)) {
		return { ok: false, code: 403, message: 'Tu perfil debe estar aprobado para gestionar líneas de servicio' };
	}
	return { ok: true, user: u };
}

function toItem(doc) {
	const o = doc.toObject ? doc.toObject() : doc;
	return {
		id: o._id,
		_id: o._id,
		displayName: o.displayName,
		slotDurationMinutes: o.slotDurationMinutes,
		priceClp: o.priceClp != null ? o.priceClp : undefined,
		currency: o.currency || 'CLP',
		active: o.active !== false
	};
}

async function listMine(req, res, next) {
	try {
		const gate = await assertProveedorActivo(req.user.id);
		if (!gate.ok) return res.status(gate.code).json({ message: gate.message });

		const items = await ClinicService.find({ providerId: req.user.id })
			.sort({ displayName: 1 })
			.lean();
		return res.status(200).json({ items: items.map(toItem) });
	} catch (e) {
		next(e);
	}
}

async function createMine(req, res, next) {
	try {
		const gate = await assertProveedorActivo(req.user.id);
		if (!gate.ok) return res.status(gate.code).json({ message: gate.message });

		const displayName = req.body.displayName != null ? String(req.body.displayName).trim() : '';
		if (!displayName) {
			return res.status(400).json({ message: 'displayName es obligatorio' });
		}
		if (displayName.length > 120) {
			return res.status(400).json({ message: 'displayName no puede superar 120 caracteres' });
		}

		let slotDurationMinutes = Number(req.body.slotDurationMinutes);
		if (!Number.isFinite(slotDurationMinutes)) slotDurationMinutes = 30;
		slotDurationMinutes = Math.round(slotDurationMinutes);
		if (slotDurationMinutes < 15 || slotDurationMinutes > 180) {
			return res.status(400).json({ message: 'slotDurationMinutes debe estar entre 15 y 180' });
		}

		const isWalker = gate.user.providerType === 'paseador' || gate.user.providerType === 'cuidador';
		let priceClp = undefined;
		if (isWalker) {
			const pr = Number(String(req.body.priceClp ?? '').replace(',', '.'));
			if (!Number.isFinite(pr) || pr < 0) {
				return res.status(400).json({ message: 'priceClp debe ser un número >= 0 para paseador/cuidador' });
			}
			priceClp = pr;
		}

		const doc = await ClinicService.create({
			providerId: req.user.id,
			displayName,
			slotDurationMinutes,
			priceClp: priceClp != null ? priceClp : null,
			currency: req.body.currency != null ? String(req.body.currency).trim().slice(0, 8) : 'CLP',
			active: true
		});

		return res.status(201).json({ message: 'Línea creada', item: toItem(doc) });
	} catch (e) {
		next(e);
	}
}

async function updateMine(req, res, next) {
	try {
		const gate = await assertProveedorActivo(req.user.id);
		if (!gate.ok) return res.status(gate.code).json({ message: gate.message });

		const { id } = req.params;
		if (!mongoose.isValidObjectId(id)) {
			return res.status(400).json({ message: 'Id inválido' });
		}

		const doc = await ClinicService.findOne({ _id: id, providerId: req.user.id });
		if (!doc) {
			return res.status(404).json({ message: 'Línea no encontrada' });
		}

		if (req.body.displayName != null) {
			const n = String(req.body.displayName).trim();
			if (!n) return res.status(400).json({ message: 'displayName no puede quedar vacío' });
			if (n.length > 120) return res.status(400).json({ message: 'displayName demasiado largo' });
			doc.displayName = n;
		}
		if (req.body.slotDurationMinutes != null) {
			const m = Math.round(Number(req.body.slotDurationMinutes));
			if (!Number.isFinite(m) || m < 15 || m > 180) {
				return res.status(400).json({ message: 'slotDurationMinutes inválido' });
			}
			doc.slotDurationMinutes = m;
		}
		if (req.body.priceClp != null) {
			const pr = Number(String(req.body.priceClp).replace(',', '.'));
			if (!Number.isFinite(pr) || pr < 0) {
				return res.status(400).json({ message: 'priceClp inválido' });
			}
			doc.priceClp = pr;
		}
		if (req.body.currency != null) {
			doc.currency = String(req.body.currency).trim().slice(0, 8) || 'CLP';
		}
		if (req.body.active != null) {
			doc.active = Boolean(req.body.active);
		}

		await doc.save();
		return res.status(200).json({ message: 'Línea actualizada', item: toItem(doc) });
	} catch (e) {
		next(e);
	}
}

module.exports = { listMine, createMine, updateMine };
