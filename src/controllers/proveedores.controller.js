'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const { distanceKm } = require('../utils/haversine');
const { geocodeAddressNominatim } = require('../utils/geocodeNominatim');

const PRIVATE_PROFILE_KEYS = new Set(['rejectionReason', 'reviewedAt', 'reviewedBy']);
const DEFAULT_MAP_CENTER = {
	lat: -33.4489,
	lng: -70.6693,
	label: 'Santiago'
};

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
		const user = await User.findById(id).select(
			'name lastName profileImage providerType role status providerProfile'
		);
		if (!user || user.role !== 'proveedor' || user.status !== 'aprobado') {
			return res.status(404).json({ message: 'Proveedor no encontrado' });
		}
		return res.status(200).json({
			proveedor: {
				id: user._id,
				name: user.name,
				lastName: user.lastName,
				profileImage: user.profileImage || null,
				providerType: user.providerType,
				perfil: toPublicProviderProfile(user.providerProfile)
			}
		});
	} catch (err) {
		next(err);
	}
}

const PROVIDER_KINDS = ['veterinaria', 'paseador', 'cuidador'];

function buildProviderFilter(q) {
	const filter = { role: 'proveedor', status: 'aprobado' };

	if (q.tipo !== undefined && String(q.tipo).trim()) {
		const tipo = String(q.tipo).trim();
		if (!PROVIDER_KINDS.includes(tipo)) {
			throw Object.assign(new Error('tipo debe ser veterinaria, paseador o cuidador'), { status: 400 });
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
		filter.$or = [{ 'providerProfile.address.city': re }, { 'providerProfile.address.commune': re }];
	}

	const amountCond = {};
	if (q.precioMin !== undefined && String(q.precioMin).trim() !== '') {
		const v = Number(q.precioMin);
		if (!Number.isNaN(v)) amountCond.$gte = v;
	}
	if (q.precioMax !== undefined && String(q.precioMax).trim() !== '') {
		const v = Number(q.precioMax);
		if (!Number.isNaN(v)) amountCond.$lte = v;
	}
	if (Object.keys(amountCond).length > 0) {
		filter['providerProfile.referenceRate.amount'] = amountCond;
	}

	if (q.estadoOperacion !== undefined && String(q.estadoOperacion).trim()) {
		const estadoOperacion = String(q.estadoOperacion).trim();
		if (!['abierto', 'temporalmente_cerrado'].includes(estadoOperacion)) {
			throw Object.assign(new Error('estadoOperacion debe ser abierto o temporalmente_cerrado'), {
				status: 400
			});
		}
		filter['providerProfile.operationalStatus'] = estadoOperacion;
	}

	return filter;
}

function parseGeoQuery(q) {
	const latRaw = q.lat;
	const lngRaw = q.lng;
	const radioRaw = q.radio;
	if (latRaw === undefined || lngRaw === undefined || radioRaw === undefined) {
		return { hasGeo: false };
	}

	const lat0 = Number(latRaw);
	const lng0 = Number(lngRaw);
	const radioKm = Number(radioRaw);
	if (Number.isNaN(lat0) || Number.isNaN(lng0) || Number.isNaN(radioKm)) {
		throw Object.assign(new Error('lat, lng y radio deben ser números válidos'), { status: 400 });
	}
	if (radioKm < 0) {
		throw Object.assign(new Error('radio debe ser mayor o igual a 0'), { status: 400 });
	}

	return { hasGeo: true, lat0, lng0, radioKm };
}

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
				.select('name lastName profileImage providerType providerProfile')
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limite)
				.lean()
		]);

		const resultados = docs.map((d) => ({
			id: d._id,
			name: d.name,
			lastName: d.lastName,
			profileImage: d.profileImage || null,
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

		const filter = buildProviderFilter(q);
		const geo = parseGeoQuery(q);
		if (geo.hasGeo) {
			filter['providerProfile.address.coordinates.lat'] = { $exists: true, $ne: null };
			filter['providerProfile.address.coordinates.lng'] = { $exists: true, $ne: null };
		}

		let docs = await User.find(filter)
			.select('name lastName profileImage providerType providerProfile')
			.sort({ createdAt: -1 })
			.lean();

		if (geo.hasGeo) {
			const filtered = docs
				.map((d) => {
					const latp = d.providerProfile?.address?.coordinates?.lat;
					const lngp = d.providerProfile?.address?.coordinates?.lng;
					if (latp == null || lngp == null) {
						return null;
					}
					const dist = distanceKm(geo.lat0, geo.lng0, latp, lngp);
					return dist <= geo.radioKm ? { d, dist } : null;
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
			profileImage: d.profileImage || null,
			providerType: d.providerType,
			providerProfile: toPublicProviderProfile(d.providerProfile)
		}));

		return res.status(200).json({ total, pagina, limite, resultados });
	} catch (err) {
		if (err.status === 400) {
			return res.status(400).json({ message: err.message });
		}
		next(err);
	}
}

/**
 * GET /api/proveedores/mapa — datos de marcadores para Leaflet/OpenStreetMap
 */
async function getProvidersMapData(req, res, next) {
	try {
		const q = req.query || {};
		const filter = buildProviderFilter(q);
		filter['providerProfile.address.coordinates.lat'] = { $exists: true, $ne: null };
		filter['providerProfile.address.coordinates.lng'] = { $exists: true, $ne: null };

		const geo = parseGeoQuery(q);
		const limiteRaw = parseInt(q.limite, 10) || 500;
		const limite = Math.min(2000, Math.max(1, limiteRaw));

		let docs = await User.find(filter)
			.select('name lastName profileImage providerType providerProfile')
			.sort({ createdAt: -1 })
			.limit(limite)
			.lean();

		let center = DEFAULT_MAP_CENTER;
		if (geo.hasGeo) {
			center = { lat: geo.lat0, lng: geo.lng0, label: 'Ubicación actual' };
			docs = docs
				.map((d) => {
					const latp = d.providerProfile.address.coordinates.lat;
					const lngp = d.providerProfile.address.coordinates.lng;
					const dist = distanceKm(geo.lat0, geo.lng0, latp, lngp);
					return dist <= geo.radioKm ? { ...d, _distanceKm: dist } : null;
				})
				.filter(Boolean)
				.sort((a, b) => a._distanceKm - b._distanceKm);
		}

		const markers = docs.map((d) => {
			const operationalStatus = d.providerProfile?.operationalStatus || 'abierto';
			const markerType = d.providerType === 'veterinaria' ? 'medical_cross' : 'paw';
			return {
				id: d._id,
				name: d.name,
				lastName: d.lastName,
				fullName: `${d.name || ''} ${d.lastName || ''}`.trim(),
				profileImage: d.profileImage || null,
				providerType: d.providerType,
				markerType,
				rating: d.providerProfile?.ratingAverage ?? null,
				ratingCount: d.providerProfile?.ratingCount ?? 0,
				operationalStatus,
				isTemporarilyClosed: operationalStatus === 'temporalmente_cerrado',
				opacity: operationalStatus === 'temporalmente_cerrado' ? 0.55 : 1,
				coordinates: {
					lat: d.providerProfile.address.coordinates.lat,
					lng: d.providerProfile.address.coordinates.lng
				},
				distanceKm: d._distanceKm ?? null,
				providerProfile: toPublicProviderProfile(d.providerProfile)
			};
		});

		return res.status(200).json({
			center,
			total: markers.length,
			markers
		});
	} catch (err) {
		if (err.status === 400) {
			return res.status(400).json({ message: err.message });
		}
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
		if (body.operationalStatus !== undefined) {
			const operationalStatus = String(body.operationalStatus).trim();
			if (!['abierto', 'temporalmente_cerrado'].includes(operationalStatus)) {
				return res
					.status(400)
					.json({ message: 'operationalStatus debe ser abierto o temporalmente_cerrado' });
			}
			$set['providerProfile.operationalStatus'] = operationalStatus;
		}

		if (body.address !== undefined) {
			if (body.address === null || typeof body.address !== 'object') {
				return res.status(400).json({ message: 'address debe ser un objeto' });
			}
			const a = body.address;

			// Necesitamos poder geocodificar con dirección completa aunque venga parcial.
			let existingAddress = null;
			const wantsAddressUpdate =
				a.street !== undefined ||
				a.commune !== undefined ||
				a.city !== undefined ||
				a.coordinates !== undefined;
			const hasIncomingCoords =
				a.coordinates !== undefined &&
				a.coordinates !== null &&
				typeof a.coordinates === 'object' &&
				(a.coordinates.lat !== undefined || a.coordinates.lng !== undefined);

			if (wantsAddressUpdate && !hasIncomingCoords) {
				const existing = await User.findById(req.user.id).select('providerProfile.address').lean();
				existingAddress = existing?.providerProfile?.address || null;
			}

			const nextStreet =
				a.street !== undefined
					? a.street == null
						? ''
						: String(a.street).trim()
					: existingAddress?.street || '';
			const nextCommune =
				a.commune !== undefined
					? a.commune == null
						? ''
						: String(a.commune).trim()
					: existingAddress?.commune || '';
			const nextCity =
				a.city !== undefined ? (a.city == null ? '' : String(a.city).trim()) : existingAddress?.city || '';

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
			} else {
				// Si el cliente no envía coords, intentamos geocodificar automáticamente.
				// No bloqueamos el update si Nominatim falla; solo quedará sin marcador.
				const geo = await geocodeAddressNominatim({
					street: nextStreet,
					commune: nextCommune,
					city: nextCity,
					country: 'Chile'
				});
				if (geo) {
					$set['providerProfile.address.coordinates.lat'] = geo.lat;
					$set['providerProfile.address.coordinates.lng'] = geo.lng;
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
	getProvidersMapData,
	updateMyProviderProfile,
	toPublicProviderProfile
};
