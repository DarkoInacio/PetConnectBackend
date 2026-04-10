'use strict';

const { PROVIDER_KINDS } = require('../models/User');

function parseStringArray(value) {
	if (value == null || value === '') return [];
	if (Array.isArray(value)) {
		return value.map(String).map((s) => s.trim()).filter(Boolean);
	}
	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value);
			if (Array.isArray(parsed)) {
				return parsed.map(String).map((s) => s.trim()).filter(Boolean);
			}
		} catch (_) {
			/* continuar con split */
		}
		return value
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}
	return [];
}

function parseNumber(value) {
	if (value === '' || value == null) return undefined;
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
}

/**
 * Construye el objeto providerProfile y devuelve { ok: true, profile } o { ok: false, message }
 */
function buildAndValidateProviderProfile(providerType, body, galleryPaths) {
	if (!PROVIDER_KINDS.includes(providerType)) {
		return { ok: false, message: 'providerType debe ser veterinaria, paseador o cuidador' };
	}

	const gallery = Array.isArray(galleryPaths) ? galleryPaths.slice(0, 3) : [];
	if (gallery.length > 3) {
		return { ok: false, message: 'Máximo 3 imágenes' };
	}

	if (providerType === 'veterinaria') {
		const street = (body.addressStreet || '').trim();
		const commune = (body.addressCommune || '').trim();
		const licenseNumber = (body.licenseNumber || '').trim();
		const specialties = parseStringArray(body.specialties);

		if (!street || !commune) {
			return { ok: false, message: 'Veterinaria: dirección (calle) y comuna son obligatorias' };
		}
		if (!licenseNumber) {
			return { ok: false, message: 'Veterinaria: número de registro es obligatorio' };
		}
		if (specialties.length < 1) {
			return { ok: false, message: 'Veterinaria: ingrese al menos una especialidad' };
		}

		const address = { street, commune };
		const lat = parseNumber(body.addressLat);
		const lng = parseNumber(body.addressLng);
		if (lat !== undefined && lng !== undefined) {
			address.coordinates = { lat, lng };
		}

		return {
			ok: true,
			profile: {
				address,
				licenseNumber,
				specialties,
				gallery
			}
		};
	}

	// paseador | cuidador
	const serviceCommunes = parseStringArray(body.serviceCommunes);
	const petTypes = parseStringArray(body.petTypes);
	const amount = parseNumber(body.referenceRateAmount);
	const unit = (body.referenceRateUnit || '').trim();
	const currency = (body.referenceRateCurrency || 'CLP').trim();

	if (serviceCommunes.length < 1) {
		return { ok: false, message: 'Indique al menos una comuna de servicio' };
	}
	if (petTypes.length < 1) {
		return { ok: false, message: 'Indique al menos un tipo de mascota' };
	}
	if (amount === undefined || amount < 0) {
		return { ok: false, message: 'Tarifa referencial: monto numérico obligatorio' };
	}
	if (!unit) {
		return { ok: false, message: 'Tarifa referencial: unidad obligatoria (ej. por_hora, por_paseo)' };
	}

	return {
		ok: true,
		profile: {
			serviceCommunes,
			petTypes,
			referenceRate: { amount, currency, unit },
			gallery
		}
	};
}

module.exports = {
	parseStringArray,
	buildAndValidateProviderProfile
};
