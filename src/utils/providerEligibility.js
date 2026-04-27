'use strict';

/**
 * Normaliza el estado de cuenta para comparaciones (enum en BD es en minúsculas).
 * @param {unknown} status
 * @returns {string}
 */
function normalizeAccountStatus(status) {
	return String(status == null ? '' : status)
		.trim()
		.toLowerCase();
}

/**
 * Proveedor publicado: rol proveedor y estado explícitamente aprobado.
 * @param {{ role?: string, status?: string } | null | undefined} user
 * @returns {boolean}
 */
function isProveedorAprobado(user) {
	if (!user || user.role !== 'proveedor') return false;
	return normalizeAccountStatus(user.status) === 'aprobado';
}

module.exports = {
	normalizeAccountStatus,
	isProveedorAprobado
};
