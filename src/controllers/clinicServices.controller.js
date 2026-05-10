'use strict';

const mongoose = require('mongoose');
const ClinicService = require('../models/ClinicService');
const User = require('../models/User');

function effectiveRoles(u) {
	if (!u) return [];
	return u.roles && u.roles.length > 0 ? u.roles : [u.role];
}

async function ensureApprovedProveedor(req) {
	const u = await User.findById(req.user.id).select('role status providerType roles').lean();
	if (!u) {
		return { ok: false, code: 403, message: 'Usuario no encontrado' };
	}
	if (!effectiveRoles(u).includes('proveedor')) {
		return { ok: false, code: 403, message: 'Solo proveedores pueden gestionar servicios' };
	}
	if (u.status !== 'aprobado') {
		return { ok: false, code: 403, message: 'Tu perfil de proveedor debe estar aprobado' };
	}
	return { ok: true, providerType: u.providerType };
}

async function listClinicServices(req, res, next) {
	try {
		const p = await ensureApprovedProveedor(req);
		if (!p.ok) return res.status(p.code).json({ message: p.message });
		const items = await ClinicService.find({ providerId: req.user.id })
			.sort({ displayName: 1 })
			.lean();
		return res.status(200).json({ items });
	} catch (e) {
		next(e);
	}
}

async function createClinicService(req, res, next) {
	try {
		const p = await ensureApprovedProveedor(req);
		if (!p.ok) return res.status(p.code).json({ message: p.message });
		const pType = p.providerType;
		const { displayName, kind, slotDurationMinutes, priceClp, currency } = req.body || {};
		const name = displayName == null ? '' : String(displayName).trim();
		if (!name) {
			return res.status(400).json({ message: 'displayName es obligatorio' });
		}
		let step = 30;
		if (slotDurationMinutes != null && String(slotDurationMinutes).trim() !== '') {
			step = Number(slotDurationMinutes);
			if (Number.isNaN(step) || step < 15 || step > 180) {
				return res.status(400).json({ message: 'slotDurationMinutes debe estar entre 15 y 180' });
			}
		}
		let price = null;
		if (pType === 'paseador' || pType === 'cuidador') {
			const pr = priceClp != null && String(priceClp).trim() !== '' ? Number(priceClp) : NaN;
			if (Number.isNaN(pr) || pr < 0) {
				return res.status(400).json({ message: 'Indica un precio (priceClp) numérico ≥ 0' });
			}
			price = pr;
		} else if (priceClp != null && String(priceClp).trim() !== '') {
			const pr = Number(priceClp);
			if (!Number.isNaN(pr) && pr >= 0) {
				price = pr;
			}
		}
		const cur = (currency == null || String(currency).trim() === '' ? 'CLP' : String(currency).trim().slice(0, 8));
		const doc = await ClinicService.create({
			providerId: req.user.id,
			displayName: name,
			kind: kind == null || String(kind).trim() === '' ? 'consulta' : String(kind).trim().slice(0, 80),
			slotDurationMinutes: step,
			priceClp: price,
			currency: cur,
			active: true
		});
		return res.status(201).json({ service: doc });
	} catch (e) {
		next(e);
	}
}

async function updateClinicService(req, res, next) {
	try {
		const p = await ensureApprovedProveedor(req);
		if (!p.ok) return res.status(p.code).json({ message: p.message });
		const pType = p.providerType;
		const id = req.params.id;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({ message: 'Id inválido' });
		}
		const svc = await ClinicService.findOne({ _id: id, providerId: req.user.id });
		if (!svc) {
			return res.status(404).json({ message: 'Línea no encontrada' });
		}
		const { displayName, kind, active, slotDurationMinutes, priceClp, currency } = req.body || {};
		if (displayName != null) {
			const n = String(displayName).trim();
			if (n) svc.displayName = n;
		}
		if (kind != null) svc.kind = String(kind).trim().slice(0, 80) || svc.kind;
		if (typeof active === 'boolean') svc.active = active;
		if (slotDurationMinutes != null && String(slotDurationMinutes).trim() !== '') {
			const step = Number(slotDurationMinutes);
			if (Number.isNaN(step) || step < 15 || step > 180) {
				return res.status(400).json({ message: 'slotDurationMinutes debe estar entre 15 y 180' });
			}
			svc.slotDurationMinutes = step;
		}
		if (priceClp != null) {
			if (String(priceClp).trim() === '') {
				if (pType === 'paseador' || pType === 'cuidador') {
					return res.status(400).json({ message: 'El precio es obligatorio para paseador o cuidador' });
				}
				svc.priceClp = null;
			} else {
				const pr = Number(priceClp);
				if (Number.isNaN(pr) || pr < 0) {
					return res.status(400).json({ message: 'priceClp inválido' });
				}
				svc.priceClp = pr;
			}
		}
		if (currency != null) svc.currency = String(currency).trim().slice(0, 8) || svc.currency;
		await svc.save();
		return res.status(200).json({ service: svc });
	} catch (e) {
		next(e);
	}
}

module.exports = {
	listClinicServices,
	createClinicService,
	updateClinicService
};
