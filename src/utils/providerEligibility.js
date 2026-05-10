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
 * @param {{ role?: string, roles?: string[] } | null | undefined} user
 * @returns {boolean}
 */
function userHasProveedorRole(user) {
	if (!user) return false;
	const rs = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : [user.role];
	return rs.includes('proveedor');
}

/**
 * Proveedor publicado: rol proveedor y estado explícitamente aprobado.
 * @param {{ role?: string, roles?: string[], status?: string } | null | undefined} user
 * @returns {boolean}
 */
function isProveedorAprobado(user) {
	if (!user || !userHasProveedorRole(user)) return false;
	return normalizeAccountStatus(user.status) === 'aprobado';
}

module.exports = {
	normalizeAccountStatus,
	userHasProveedorRole,
	isProveedorAprobado
};
