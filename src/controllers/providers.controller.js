'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const ClinicService = require('../models/ClinicService');
const { distanceKm } = require('../utils/haversine');
const { geocodeAddressNominatim } = require('../utils/geocodeNominatim');
const {
	getRatingSummary,
	getRecentReviews,
	formatReviewsForPublic
} = require('../services/providerRating.service');
const {
	mergeWalkerProfileForPublish,
	validatePaseadorCuidadorForPublish
} = require('../utils/walkerProfileValidation');
const Appointment = require('../models/Appointment');
const { isProveedorAprobado } = require('../utils/providerEligibility');
const { parseWallHmStrict, wallMinutesFromHm } = require('../utils/chileCalendar');

const PRIVATE_PROFILE_KEYS = new Set(['rejectionReason', 'reviewedAt', 'reviewedBy']);
const DEFAULT_MAP_CENTER = {
	lat: -33.4489,
	lng: -70.6693,
	label: 'Santiago'
};

const RESERVED_PUBLIC_SLUGS = new Set([
	'buscar',
	'mapa',
	'mi-perfil',
	'perfil',
	'auth',
	'admin',
	'profile',
	'appointments',
	'citas',
	'proveedores',
	'providers',
	'api'
]);

const PROVIDER_KINDS = ['veterinaria', 'paseador', 'cuidador'];

function assertValidPublicSlug(slug) {
	if (typeof slug !== 'string') {
		throw Object.assign(new Error('publicSlug inválido'), { status: 400 });
	}
	const s = slug.trim().toLowerCase();
	if (s.length < 3 || s.length > 80) {
		throw Object.assign(new Error('publicSlug debe tener entre 3 y 80 caracteres'), { status: 400 });
	}
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) {
		throw Object.assign(
			new Error('publicSlug solo permite letras minúsculas, números y guiones'),
			{ status: 400 }
		);
	}
	if (RESERVED_PUBLIC_SLUGS.has(s)) {
		throw Object.assign(new Error('publicSlug reservado, elige otro'), { status: 400 });
	}
	return s;
}

function mapClinicServicePublic(row) {
	return {
		id: row._id,
		_id: row._id,
		displayName: row.displayName,
		slotDurationMinutes: row.slotDurationMinutes,
		priceClp: row.priceClp != null ? row.priceClp : undefined,
		currency: row.currency || 'CLP',
		active: row.active !== false
	};
}

async function buildPublicProveedorResponse(user) {
	const id = user._id;
	const [summary, recent, clinicRows] = await Promise.all([
		getRatingSummary(id),
		getRecentReviews(id, 5),
		ClinicService.find({ providerId: id, active: { $ne: false } }).sort({ displayName: 1 }).lean()
	]);
	const slug = user.providerProfile?.publicSlug || null;
	const profilePath =
		slug && user.providerType ? `/api/proveedores/perfil/${user.providerType}/${slug}` : null;
	const seoPath = slug && user.providerType ? `/${user.providerType}/${slug}` : null;

	return {
		id,
		name: user.name,
		lastName: user.lastName,
		phone: user.phone || null,
		profileImage: user.profileImage || null,
		providerType: user.providerType,
		publicSlug: slug,
		profilePath,
		seoPath,
		perfil: toPublicProviderProfile(user.providerProfile),
		ratingSummary: summary,
		reviewsRecent: formatReviewsForPublic(recent),
		clinicServices: clinicRows.map(mapClinicServicePublic)
	};
}

function assertProviderVisiblePublic(user) {
	if (!user || !isProveedorAprobado(user)) {
		return false;
	}
	if (user.providerProfile && user.providerProfile.isPublished === false) {
		return false;
	}
	return true;
}

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
			'name lastName phone profileImage providerType role status providerProfile'
		);
		if (!assertProviderVisiblePublic(user)) {
			return res.status(404).json({ message: 'Proveedor no encontrado' });
		}
		const proveedor = await buildPublicProveedorResponse(user);
		return res.status(200).json({ proveedor });
	} catch (err) {
		next(err);
	}
}

/**
 * GET /api/proveedores/perfil/:tipo/:slug
 */
async function getProviderPublicProfileBySlug(req, res, next) {
	try {
		const tipo = String(req.params.tipo || '').trim();
		const slug = String(req.params.slug || '').trim().toLowerCase();
		if (!PROVIDER_KINDS.includes(tipo)) {
			return res.status(400).json({ message: 'tipo debe ser veterinaria, paseador o cuidador' });
		}
		if (!slug) {
			return res.status(400).json({ message: 'slug inválido' });
		}

		const user = await User.findOne({
			role: 'proveedor',
			status: 'aprobado',
			providerType: tipo,
			'providerProfile.publicSlug': slug,
			'providerProfile.isPublished': { $ne: false }
		}).select('name lastName phone profileImage providerType role status providerProfile');

		if (!user) {
			return res.status(404).json({ message: 'Proveedor no encontrado' });
		}

		const proveedor = await buildPublicProveedorResponse(user);
		return res.status(200).json({ proveedor });
	} catch (err) {
		next(err);
	}
}

const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function buildProviderFilter(q) {
	const filter = {
		role: 'proveedor',
		status: 'aprobado',
		'providerProfile.isPublished': { $ne: false }
	};

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
		filter.$or = [
			{ 'providerProfile.address.city': re },
			{ 'providerProfile.address.commune': re },
			{ 'providerProfile.serviceCommunes': re }
		];
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

function normalizeStringArray(raw, fieldName) {
	if (raw === undefined) return undefined;
	if (!Array.isArray(raw)) {
		throw Object.assign(new Error(`${fieldName} debe ser un arreglo de strings`), { status: 400 });
	}
	return raw.map((v) => String(v).trim()).filter(Boolean);
}

function parseWalkerTariffs(raw) {
	if (raw === undefined) return undefined;
	if (raw === null || typeof raw !== 'object') {
		throw Object.assign(new Error('walkerTariffs debe ser un objeto'), { status: 400 });
	}
	const out = {};
	for (const k of ['walk30min', 'walk60min', 'dayCare', 'overnight']) {
		if (raw[k] !== undefined) {
			const n = Number(raw[k]);
			if (Number.isNaN(n) || n < 0) {
				throw Object.assign(new Error(`walkerTariffs.${k} debe ser un número mayor o igual a 0`), {
					status: 400
				});
			}
			out[k] = n;
		}
	}
	if (raw.currency !== undefined) {
		out.currency = String(raw.currency).trim() || 'CLP';
	}
	return out;
}

function parseWeeklyAvailability(raw) {
	if (raw === undefined) return undefined;
	if (!Array.isArray(raw)) {
		throw Object.assign(new Error('weeklyAvailability debe ser un arreglo'), { status: 400 });
	}
	return raw.map((d) => {
		if (d === null || typeof d !== 'object') {
			throw Object.assign(new Error('Cada bloque de weeklyAvailability debe ser un objeto'), {
				status: 400
			});
		}
		const day = String(d.day || '').trim().toLowerCase();
		if (!WEEK_DAYS.includes(day)) {
			throw Object.assign(new Error(`weeklyAvailability.day inválido: ${day}`), { status: 400 });
		}
		const enabled = d.enabled === undefined ? true : Boolean(d.enabled);
		let ranges = [];
		if (d.ranges !== undefined) {
			if (!Array.isArray(d.ranges)) {
				throw Object.assign(new Error('weeklyAvailability.ranges debe ser un arreglo'), { status: 400 });
			}
			ranges = d.ranges.map((r) => {
				if (r === null || typeof r !== 'object') {
					throw Object.assign(new Error('Cada rango de weeklyAvailability debe ser un objeto'), {
						status: 400
					});
				}
				const start = String(r.start || '').trim();
				const end = String(r.end || '').trim();
				if (!start || !end) {
					throw Object.assign(new Error('weeklyAvailability.ranges requiere start y end'), {
						status: 400
					});
				}
				return { start, end };
			});
		}
		return { day, enabled, ranges };
	});
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
		const $unset = {};
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
		if (body.serviceCommunes !== undefined) {
			$set['providerProfile.serviceCommunes'] = normalizeStringArray(
				body.serviceCommunes,
				'serviceCommunes'
			);
		}
		if (body.petTypes !== undefined) {
			$set['providerProfile.petTypes'] = normalizeStringArray(body.petTypes, 'petTypes');
		}
		if (body.experienceYears !== undefined) {
			const v = Number(body.experienceYears);
			if (Number.isNaN(v) || v < 0) {
				return res.status(400).json({ message: 'experienceYears debe ser un número mayor o igual a 0' });
			}
			$set['providerProfile.experienceYears'] = v;
		}
		if (body.petsAttended !== undefined) {
			$set['providerProfile.petsAttended'] =
				body.petsAttended == null ? '' : String(body.petsAttended).trim();
		}
		if (body.weeklyAvailability !== undefined) {
			$set['providerProfile.weeklyAvailability'] = parseWeeklyAvailability(body.weeklyAvailability);
		}
		if (body.walkerTariffs !== undefined) {
			const tariffs = parseWalkerTariffs(body.walkerTariffs);
			for (const [k, v] of Object.entries(tariffs)) {
				$set[`providerProfile.walkerTariffs.${k}`] = v;
			}
		}
		if (body.isPublished !== undefined) {
			$set['providerProfile.isPublished'] = Boolean(body.isPublished);
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

		if (body.agendaSlotStart !== undefined || body.agendaSlotEnd !== undefined) {
			const existingAgenda = await User.findById(req.user.id)
				.select('providerType providerProfile.agendaSlotStart providerProfile.agendaSlotEnd')
				.lean();
			if (!existingAgenda || existingAgenda.providerType !== 'veterinaria') {
				return res.status(400).json({
					message:
						'agendaSlotStart y agendaSlotEnd solo aplican a cuentas tipo veterinaria. Usa Mi perfil de proveedor.'
				});
			}
			const prevS = existingAgenda.providerProfile?.agendaSlotStart;
			const prevE = existingAgenda.providerProfile?.agendaSlotEnd;
			const rawS =
				body.agendaSlotStart !== undefined ? body.agendaSlotStart : prevS != null ? prevS : '09:00';
			const rawE =
				body.agendaSlotEnd !== undefined ? body.agendaSlotEnd : prevE != null ? prevE : '18:00';
			const st = parseWallHmStrict(rawS);
			const en = parseWallHmStrict(rawE);
			if (!st || !en) {
				return res.status(400).json({
					message: 'agendaSlotStart y agendaSlotEnd deben ser horas validas en formato HH:MM (24 h).'
				});
			}
			if (wallMinutesFromHm(en) <= wallMinutesFromHm(st)) {
				return res.status(400).json({
					message: 'La hora de cierre debe ser posterior a la de apertura el mismo dia civil.'
				});
			}
			$set['providerProfile.agendaSlotStart'] = st;
			$set['providerProfile.agendaSlotEnd'] = en;
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

		if (body.referenceRate !== undefined) {
			if (body.referenceRate === null) {
				$unset['providerProfile.referenceRate'] = '';
			} else if (typeof body.referenceRate !== 'object') {
				return res.status(400).json({ message: 'referenceRate debe ser un objeto' });
			} else {
				const rr = body.referenceRate;
				if (rr.amount !== undefined) {
					const n = Number(rr.amount);
					if (Number.isNaN(n) || n < 0) {
						return res.status(400).json({ message: 'referenceRate.amount inválido' });
					}
					$set['providerProfile.referenceRate.amount'] = n;
				}
				if (rr.currency !== undefined) {
					$set['providerProfile.referenceRate.currency'] = String(rr.currency || 'CLP').trim();
				}
				if (rr.unit !== undefined) {
					$set['providerProfile.referenceRate.unit'] =
						rr.unit == null ? '' : String(rr.unit).trim();
				}
			}
		}

		if (body.isPublished === true) {
			const existingUser = await User.findById(req.user.id).lean();
			if (
				existingUser &&
				(existingUser.providerType === 'paseador' || existingUser.providerType === 'cuidador')
			) {
				const mergedProfile = mergeWalkerProfileForPublish(existingUser.providerProfile, body);
				const errMsg = validatePaseadorCuidadorForPublish(existingUser.providerType, mergedProfile);
				if (errMsg) {
					return res.status(400).json({ message: errMsg });
				}
			}
		}

		if (body.publicSlug !== undefined) {
			if (body.publicSlug === null || String(body.publicSlug).trim() === '') {
				$unset['providerProfile.publicSlug'] = '';
			} else {
				let s;
				try {
					s = assertValidPublicSlug(String(body.publicSlug));
				} catch (e) {
					if (e.status === 400) {
						return res.status(400).json({ message: e.message });
					}
					throw e;
				}
				const taken = await User.findOne({
					'providerProfile.publicSlug': s,
					_id: { $ne: req.user.id }
				})
					.select('_id')
					.lean();
				if (taken) {
					return res.status(409).json({ message: 'publicSlug ya está en uso' });
				}
				$set['providerProfile.publicSlug'] = s;
			}
		}

		if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
			return res.status(400).json({ message: 'No hay campos para actualizar' });
		}

		const updateOps = {};
		if (Object.keys($set).length) updateOps.$set = $set;
		if (Object.keys($unset).length) updateOps.$unset = $unset;

		const user = await User.findOneAndUpdate(
			{ _id: req.user.id, role: 'proveedor' },
			updateOps,
			{ new: true, runValidators: true, context: 'query' }
		).select('-password -passwordResetToken -passwordResetExpires');

		if (!user) {
			return res.status(403).json({ message: 'Solo los proveedores pueden editar este perfil' });
		}

		return res.status(200).json({ message: 'Perfil actualizado', user });
	} catch (err) {
		if (err.code === 11000) {
			return res.status(409).json({ message: 'publicSlug ya está en uso' });
		}
		if (err.status === 400) {
			return res.status(400).json({ message: err.message });
		}
		next(err);
	}
}

/**
 * POST /api/proveedores/solicitar-servicio — HU-10 flujo base (dueño → paseador/cuidador)
 */
async function requestWalkerService(req, res, next) {
	try {
		const { providerId, pet, message, preferredStart, preferredEnd } = req.body || {};

		if (!providerId || !mongoose.isValidObjectId(providerId)) {
			return res.status(400).json({ message: 'providerId es obligatorio y debe ser un id válido' });
		}

		const name = pet?.name != null ? String(pet.name).trim() : '';
		const species = pet?.species != null ? String(pet.species).trim() : '';
		if (!name || !species) {
			return res.status(400).json({ message: 'pet.name y pet.species son obligatorios' });
		}

		const prov = await User.findById(providerId).select(
			'role status providerType providerProfile.isPublished'
		);
		if (!prov || !isProveedorAprobado(prov)) {
			return res.status(404).json({ message: 'Proveedor no encontrado' });
		}
		if (prov.providerType !== 'paseador' && prov.providerType !== 'cuidador') {
			return res.status(400).json({ message: 'Solicitar servicio solo aplica a paseador o cuidador' });
		}
		if (prov.providerProfile && prov.providerProfile.isPublished === false) {
			return res.status(400).json({ message: 'El proveedor no tiene el perfil publicado' });
		}

		let startAt = preferredStart ? new Date(preferredStart) : new Date(Date.now() + 24 * 60 * 60 * 1000);
		let endAt = preferredEnd ? new Date(preferredEnd) : new Date(startAt.getTime() + 2 * 60 * 60 * 1000);
		if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
			return res.status(400).json({ message: 'preferredStart / preferredEnd inválidos' });
		}
		if (endAt <= startAt) {
			return res.status(400).json({ message: 'preferredEnd debe ser posterior a preferredStart' });
		}

		const msg = message != null ? String(message).trim().slice(0, 500) : '';

		const appointment = await Appointment.create({
			ownerId: req.user.id,
			providerId,
			bookingSource: 'walker_request',
			startAt,
			endAt,
			pet: { name, species },
			reason: msg || 'Solicitud de servicio',
			status: 'pending_confirmation'
		});

		return res.status(201).json({
			message: 'Solicitud registrada',
			appointment
		});
	} catch (err) {
		next(err);
	}
}

module.exports = {
	getProviderPublicProfile,
	getProviderPublicProfileBySlug,
	listApprovedProviders,
	searchProviders,
	getProvidersMapData,
	updateMyProviderProfile,
	requestWalkerService,
	toPublicProviderProfile
};
