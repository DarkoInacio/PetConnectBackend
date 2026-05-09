'use strict';

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
	{
		actorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		action: {
			type: String,
			required: true,
			trim: true,
			index: true
		},
		targetType: {
			type: String,
			trim: true,
			default: 'user'
		},
		targetId: {
			type: mongoose.Schema.Types.ObjectId,
			index: true
		},
		metadata: {
			type: mongoose.Schema.Types.Mixed,
			default: {}
		}
	},
	{ timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
