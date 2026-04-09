'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const { distanceKm } = require('../utils/haversine');

const PRIVATE_PROFILE_KEYS = new Set(['rejectionReason', 'reviewedAt', 'reviewedBy']);

function toPublicProviderProfile(pp) {
	if (!pp) return null;
	const raw = pp.toObject ? pp.toObject() : { ...pp };
	const out = {};
	for (const key of Object.keys(raw)) {
		if (!PRIVATE_PROFILE_KEYS.has(key)) {
			out[key] = raw[key];
		}
	}
	return out;
}

/**
 * GET /api/proveedores/:id/perfil
 */
async function getProviderPublicProfile(req, res, next) {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id)) {
			return res.status(400).json({ message: 'Id de proveedor inválido' });
		}
		const user = await User.findById(id).select('role status providerProfile');
		if (!user || user.role !== 'proveedor' || user.status !== 'aprobado') {
			return res.status(404).json({ message: 'Proveedor no encontrado' });
		}
		return res.status(200).json({ perfil: toPublicProviderProfile(user.providerProfile) });
	} catch (err) {
		next(err);
	}
}

const PROVIDER_KINDS = ['veterinaria', 'paseador', 'cuidador'];

/**
 * GET /api/proveedores — listado público paginado
 */
async function listApprovedProviders(req, res, next) {
	try {
		const tipo = req.query.tipo;
		const ciudad = req.query.ciudad;
		const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
		const limiteRaw = parseInt(req.query.limite, 10) || 10;
		const limite = Math.min(100, Math.max(1, limiteRaw));

		const filter = { role: 'proveedor', status: 'aprobado' };
		if (tipo !== undefined && String(tipo).trim()) {
			if (!PROVIDER_KINDS.includes(String(tipo).trim())) {
				return res.status(400).json({ message: 'tipo debe ser veterinaria, paseador o cuidador' });
			}
			filter.providerType = String(tipo).trim();
		}
		if (ciudad !== undefined && String(ciudad).trim()) {
			const esc = String(ciudad).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const re = new RegExp(esc, 'i');
			filter.$or = [
				{ 'providerProfile.address.city': re },
				{ 'providerProfile.address.commune': re }
			];
		}

		const skip = (pagina - 1) * limite;

		const [total, docs] = await Promise.all([
			User.countDocuments(filter),
			User.find(filter)
				.select('name lastName providerType providerProfile')
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limite)
				.lean()
		]);

		const resultados = docs.map((d) => ({
			id: d._id,
			name: d.name,
			lastName: d.lastName,
			providerType: d.providerType,
			providerProfile: toPublicProviderProfile(d.providerProfile)
		}));

		return res.status(200).json({ total, pagina, limite, resultados });
	} catch (err) {
		next(err);
	}
}

/**
 * GET /api/proveedores/buscar — filtros dinámicos + Haversine opcional
 */
async function searchProviders(req, res, next) {
	try {
		const q = req.query;
		const pagina = Math.max(1, parseInt(q.pagina, 10) || 1);
		const limiteRaw = parseInt(q.limite, 10) || 10;
		const limite = Math.min(100, Math.max(1, limiteRaw));

		const filter = { role: 'proveedor', status: 'aprobado' };

		if (q.tipo !== undefined && String(q.tipo).trim()) {
			const tipo = String(q.tipo).trim();
			if (!PROVIDER_KINDS.includes(tipo)) {
				return res.status(400).json({ message: 'tipo debe ser veterinaria, paseador o cuidador' });
			}
			filter.providerType = tipo;
		}

		if (q.servicio !== undefined && String(q.servicio).trim()) {
			const esc = String(q.servicio).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			filter['providerProfile.specialties'] = new RegExp(esc, 'i');
		}

		if (q.ciudad !== undefined && String(q.ciudad).trim()) {
			const esc = String(q.ciudad).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const re = new RegExp(esc, 'i');
			filter.$or = [
				{ 'providerProfile.address.city': re },
				{ 'providerProfile.address.commune': re }
			];
		}

		const amountCond = {};
		if (q.precioMin !== undefined && String(q.precioMin).trim() !== '') {
			const v = Number(q.precioMin);
			if (!Number.isNaN(v)) {
				amountCond.$gte = v;
			}
		}
		if (q.precioMax !== undefined && String(q.precioMax).trim() !== '') {
			const v = Number(q.precioMax);
			if (!Number.isNaN(v)) {
				amountCond.$lte = v;
			}
		}
		if (Object.keys(amountCond).length > 0) {
			filter['providerProfile.referenceRate.amount'] = amountCond;
		}

		const latRaw = q.lat;
		const lngRaw = q.lng;
		const radioRaw = q.radio;
		let hasGeo = false;
		let lat0;
		let lng0;
		let radioKm;

		if (latRaw !== undefined && lngRaw !== undefined && radioRaw !== undefined) {
			lat0 = Number(latRaw);
			lng0 = Number(lngRaw);
			radioKm = Number(radioRaw);
			if (Number.isNaN(lat0) || Number.isNaN(lng0) || Number.isNaN(radioKm)) {
				return res.status(400).json({ message: 'lat, lng y radio deben ser números válidos' });
			}
			if (radioKm < 0) {
				return res.status(400).json({ message: 'radio debe ser mayor o igual a 0' });
			}
			hasGeo = true;
			filter['providerProfile.address.coordinates.lat'] = { $exists: true, $ne: null };
			filter['providerProfile.address.coordinates.lng'] = { $exists: true, $ne: null };
		}

		let docs = await User.find(filter)
			.select('name lastName providerType providerProfile')
			.sort({ createdAt: -1 })
			.lean();

		if (hasGeo) {
			const filtered = docs
				.map((d) => {
					const latp = d.providerProfile?.address?.coordinates?.lat;
					const lngp = d.providerProfile?.address?.coordinates?.lng;
					if (latp == null || lngp == null) {
						return null;
					}
					const dist = distanceKm(lat0, lng0, latp, lngp);
					return dist <= radioKm ? { d, dist } : null;
				})
				.filter(Boolean)
				.sort((a, b) => a.dist - b.dist);

			docs = filtered.map((x) => x.d);
		}

		const total = docs.length;
		const skip = (pagina - 1) * limite;
		const pageDocs = docs.slice(skip, skip + limite);

		const resultados = pageDocs.map((d) => ({
			id: d._id,
			name: d.name,
			lastName: d.lastName,
			providerType: d.providerType,
			providerProfile: toPublicProviderProfile(d.providerProfile)
		}));

		return res.status(200).json({ total, pagina, limite, resultados });
	} catch (err) {
		next(err);
	}
}

function normalizeServices(raw) {
	if (raw === undefined) return undefined;
	if (!Array.isArray(raw)) {
		throw Object.assign(new Error('services debe ser un arreglo de strings'), { status: 400 });
	}
	return raw.map((s) => String(s).trim()).filter(Boolean);
}

/**
 * PUT /api/proveedores/mi-perfil
 */
async function updateMyProviderProfile(req, res, next) {
	try {
		const $set = {};
		const body = req.body || {};

		const blockedRoot = [
			'name',
			'lastName',
			'email',
			'password',
			'role',
			'status',
			'providerType',
			'providerProfile',
			'profileImage'
		];
		for (const k of blockedRoot) {
			if (Object.prototype.hasOwnProperty.call(body, k)) {
				return res.status(400).json({ message: `No se permite enviar el campo: ${k}` });
			}
		}

		if (body.gallery !== undefined) {
			return res.status(400).json({ message: 'La galería no se edita en este endpoint' });
		}

		if (body.phone !== undefined) {
			$set.phone = String(body.phone).trim();
		}
		if (body.description !== undefined) {
			$set['providerProfile.description'] = body.description == null ? '' : String(body.description).trim();
		}
		if (body.schedule !== undefined) {
			$set['providerProfile.schedule'] = body.schedule == null ? '' : String(body.schedule).trim();
		}
		if (body.services !== undefined) {
			$set['providerProfile.services'] = normalizeServices(body.services);
		}

		if (body.address !== undefined) {
			if (body.address === null || typeof body.address !== 'object') {
				return res.status(400).json({ message: 'address debe ser un objeto' });
			}
			const a = body.address;
			for (const key of ['street', 'commune', 'city']) {
				if (a[key] !== undefined) {
					$set[`providerProfile.address.${key}`] = a[key] == null ? '' : String(a[key]).trim();
				}
			}
			if (a.coordinates !== undefined && a.coordinates !== null && typeof a.coordinates === 'object') {
				const c = a.coordinates;
				if (c.lat !== undefined) {
					const lat = Number(c.lat);
					if (Number.isNaN(lat)) {
						return res.status(400).json({ message: 'coordinates.lat inválido' });
					}
					$set['providerProfile.address.coordinates.lat'] = lat;
				}
				if (c.lng !== undefined) {
					const lng = Number(c.lng);
					if (Number.isNaN(lng)) {
						return res.status(400).json({ message: 'coordinates.lng inválido' });
					}
					$set['providerProfile.address.coordinates.lng'] = lng;
				}
			}
		}

		if (body.socialMedia !== undefined) {
			if (body.socialMedia === null || typeof body.socialMedia !== 'object') {
				return res.status(400).json({ message: 'socialMedia debe ser un objeto' });
			}
			const sm = body.socialMedia;
			for (const key of ['instagram', 'facebook', 'twitter', 'website']) {
				if (sm[key] !== undefined) {
					$set[`providerProfile.socialMedia.${key}`] =
						sm[key] == null ? '' : String(sm[key]).trim();
				}
			}
		}

		if (Object.keys($set).length === 0) {
			return res.status(400).json({ message: 'No hay campos para actualizar' });
		}

		const user = await User.findOneAndUpdate(
			{ _id: req.user.id, role: 'proveedor' },
			{ $set },
			{ new: true, runValidators: true, context: 'query' }
		).select('-password -passwordResetToken -passwordResetExpires');

		if (!user) {
			return res.status(403).json({ message: 'Solo los proveedores pueden editar este perfil' });
		}

		return res.status(200).json({ message: 'Perfil actualizado', user });
	} catch (err) {
		if (err.status === 400) {
			return res.status(400).json({ message: err.message });
		}
		next(err);
	}
}

module.exports = {
	getProviderPublicProfile,
	listApprovedProviders,
	searchProviders,
	updateMyProviderProfile,
	toPublicProviderProfile
};
