'use strict';

/**
 * Alcance de la API respecto a la app web PetConnect (`PetConnect/src/services`).
 *
 * - `full` (por defecto): expone todos los módulos (mascotas, clínica veterinaria, jobs admin).
 * - `spa`: solo rutas consumidas por el SPA actual (sin `/pets`, `/vet`, `/admin/jobs`).
 *
 * Variable: `PETCONNECT_API_SCOPE` = `full` | `spa`
 */

const raw = (process.env.PETCONNECT_API_SCOPE || 'full').trim().toLowerCase();

function isSpaScope() {
	return raw === 'spa' || raw === 'frontend' || raw === 'petconnect';
}

function logScopeIfSpa() {
	if (!isSpaScope()) return;
	console.log(
		'[api] PETCONNECT_API_SCOPE=spa: rutas extendidas desactivadas (/pets, /vet, /admin/jobs).'
	);
}

module.exports = {
	isSpaScope,
	logScopeIfSpa
};
