'use strict';

const AuditLog = require('../models/AuditLog');

/**
 * @param {string} actorId
 * @param {string} action
 * @param {{ targetType?: string, targetId?: string|import('mongoose').Types.ObjectId, metadata?: object }} [opts]
 */
async function writeAuditLog(actorId, action, opts = {}) {
	try {
		await AuditLog.create({
			actorId,
			action,
			targetType: opts.targetType || 'user',
			targetId: opts.targetId || undefined,
			metadata: opts.metadata && typeof opts.metadata === 'object' ? opts.metadata : {}
		});
	} catch (err) {
		console.error('writeAuditLog:', err.message);
	}
}

module.exports = { writeAuditLog };
