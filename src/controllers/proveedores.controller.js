'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');

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
	updateMyProviderProfile,
	toPublicProviderProfile
};
