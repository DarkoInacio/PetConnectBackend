'use strict';

/**
 * Validación HU-10: publicación mínima para paseador/cuidador.
 * @param {string} providerType
 * @param {object} profile - providerProfile ya fusionado (objeto plano)
 * @returns {string|null} mensaje de error o null si OK
 */
function validatePaseadorCuidadorForPublish(providerType, profile) {
	if (!profile || (providerType !== 'paseador' && providerType !== 'cuidador')) {
		return null;
	}

	const communes = profile.serviceCommunes || [];
	const petTypes = profile.petTypes || [];
	if (!Array.isArray(communes) || communes.length < 1) {
		return 'Para publicar: indique al menos una comuna en serviceCommunes';
	}
	if (!Array.isArray(petTypes) || petTypes.length < 1) {
		return 'Para publicar: indique al menos un tipo de mascota en petTypes';
	}

	const weekly = profile.weeklyAvailability || [];
	if (!Array.isArray(weekly) || weekly.length < 1) {
		return 'Para publicar: configure weeklyAvailability (al menos un día)';
	}
	const hasActiveRange = weekly.some(
		(d) =>
			d &&
			d.enabled !== false &&
			Array.isArray(d.ranges) &&
			d.ranges.some((r) => r && String(r.start || '').trim() && String(r.end || '').trim())
	);
	if (!hasActiveRange) {
		return 'Para publicar: agregue al menos un rango horario en weeklyAvailability';
	}

	const wt = profile.walkerTariffs || {};
	const hasWalkerPrice =
		[wt.walk30min, wt.walk60min, wt.dayCare, wt.overnight].some(
			(v) => v !== undefined && v !== null && Number(v) >= 0
		) || (profile.referenceRate && Number(profile.referenceRate.amount) >= 0);

	if (!hasWalkerPrice) {
		return 'Para publicar: defina al menos una tarifa en walkerTariffs o referenceRate.amount';
	}

	return null;
}

/**
 * Fusiona perfil existente con campos del body relevantes para validar publicación.
 */
function mergeWalkerProfileForPublish(existingProfile, body) {
	const out = { ...(existingProfile || {}) };
	const keys = ['serviceCommunes', 'petTypes', 'weeklyAvailability', 'walkerTariffs', 'referenceRate', 'isPublished'];
	for (const k of keys) {
		if (Object.prototype.hasOwnProperty.call(body, k)) {
			out[k] = body[k];
		}
	}
	if (body.isPublished !== undefined) {
		out.isPublished = Boolean(body.isPublished);
	}
	return out;
}

module.exports = { validatePaseadorCuidadorForPublish, mergeWalkerProfileForPublish };
