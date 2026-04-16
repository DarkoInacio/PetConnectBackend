'use strict';

const User = require('../models/User');
const { sendEmail } = require('../utils/email');

async function listPendingProviders(req, res, next) {
	try {
		const page = Math.max(1, parseInt(req.query.page, 10) || 1);
		const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
		const skip = (page - 1) * limit;

		const filter = { role: 'proveedor', status: 'en_revision' };
		const [items, total] = await Promise.all([
			User.find(filter)
				.sort({ createdAt: 1 })
				.skip(skip)
				.limit(limit)
				.select('-password -passwordResetToken -passwordResetExpires')
				.lean(),
			User.countDocuments(filter)
		]);

		return res.status(200).json({
			items,
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit) || 1
		});
	} catch (error) {
		next(error);
	}
}

function normalizeStatuses(rawStatuses) {
	if (!rawStatuses) return [];
	const asArray = Array.isArray(rawStatuses) ? rawStatuses : [rawStatuses];
	return asArray
		.join(',')
		.split(',')
		.map((s) => String(s).trim())
		.filter(Boolean);
}

async function listProvidersByStatuses(req, res, next, statuses) {
	try {
		const page = Math.max(1, parseInt(req.query.page, 10) || 1);
		const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
		const skip = (page - 1) * limit;

		const ALLOWED_STATUSES = ['aprobado', 'rechazado'];
		const normalized = Array.isArray(statuses) ? statuses : [];

		if (!normalized.length) {
			return res.status(400).json({ message: 'status inválido' });
		}
		if (!normalized.every((s) => ALLOWED_STATUSES.includes(s))) {
			return res.status(400).json({ message: 'status inválido. Usa aprobado y/o rechazado' });
		}

		const filter = { role: 'proveedor', status: { $in: normalized } };
		const [items, total] = await Promise.all([
			User.find(filter)
				.sort({ createdAt: 1 })
				.skip(skip)
				.limit(limit)
				.select('-password -passwordResetToken -passwordResetExpires')
				.lean(),
			User.countDocuments(filter)
		]);

		return res.status(200).json({
			items,
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit) || 1
		});
	} catch (error) {
		next(error);
	}
}

// Enlista aprobados y/o rechazados (juntos o filtrado por query)
// GET /api/admin/providers?status=aprobado,rechazado
async function listApprovedRejectedProviders(req, res, next) {
	const statuses = normalizeStatuses(req.query.status);
	const finalStatuses = statuses.length ? statuses : ['aprobado', 'rechazado'];
	return listProvidersByStatuses(req, res, next, finalStatuses);
}

// Enlista solo aprobados
async function listApprovedProviders(req, res, next) {
	return listProvidersByStatuses(req, res, next, ['aprobado']);
}

// Enlista solo rechazados
async function listRejectedProviders(req, res, next) {
	return listProvidersByStatuses(req, res, next, ['rechazado']);
}

async function approveProvider(req, res, next) {
	try {
		const user = await User.findById(req.params.userId);
		if (!user) {
			return res.status(404).json({ message: 'Usuario no encontrado' });
		}
		if (user.role !== 'proveedor') {
			return res.status(400).json({ message: 'El usuario no es proveedor' });
		}
		if (user.status !== 'en_revision') {
			return res.status(400).json({ message: 'El proveedor no está en revisión' });
		}

		user.status = 'aprobado';
		if (!user.providerProfile) user.providerProfile = {};
		user.providerProfile.rejectionReason = undefined;
		user.providerProfile.reviewedAt = new Date();
		user.providerProfile.reviewedBy = req.user.id;
		await user.save();

		try {
			await sendEmail({
				to: user.email,
				subject: 'PetConnect: tu perfil de proveedor fue aprobado',
				html: `<p>Hola ${user.name},</p><p>Tu perfil como <strong>${user.providerType}</strong> ha sido <strong>aprobado</strong>. Ya puedes aparecer en la plataforma según las reglas de visibilidad del producto.</p><p>Saludos,<br>PetConnect</p>`
			});
		} catch (err) {
			console.error('approveProvider email:', err.message);
		}

		const fresh = await User.findById(user._id).select('-password -passwordResetToken -passwordResetExpires');
		return res.status(200).json({ message: 'Proveedor aprobado', user: fresh });
	} catch (error) {
		next(error);
	}
}

async function rejectProvider(req, res, next) {
	try {
		const reason = (req.body.reason || '').trim();
		if (!reason) {
			return res.status(400).json({ message: 'Debe indicar el motivo del rechazo (reason)' });
		}

		const user = await User.findById(req.params.userId);
		if (!user) {
			return res.status(404).json({ message: 'Usuario no encontrado' });
		}
		if (user.role !== 'proveedor') {
			return res.status(400).json({ message: 'El usuario no es proveedor' });
		}
		if (user.status !== 'en_revision') {
			return res.status(400).json({ message: 'El proveedor no está en revisión' });
		}

		user.status = 'rechazado';
		if (!user.providerProfile) {
			user.providerProfile = {};
		}
		user.providerProfile.rejectionReason = reason;
		user.providerProfile.reviewedAt = new Date();
		user.providerProfile.reviewedBy = req.user.id;
		await user.save();

		try {
			await sendEmail({
				to: user.email,
				subject: 'PetConnect: actualización sobre tu solicitud de proveedor',
				html: `<p>Hola ${user.name},</p><p>Lamentamos informarte que tu solicitud como <strong>${user.providerType}</strong> no ha sido aprobada.</p><p><strong>Motivo:</strong></p><p>${escapeHtml(reason)}</p><p>Si crees que es un error, contacta a soporte.</p><p>PetConnect</p>`
			});
		} catch (err) {
			console.error('rejectProvider email:', err.message);
		}

		const fresh = await User.findById(user._id).select('-password -passwordResetToken -passwordResetExpires');
		return res.status(200).json({ message: 'Proveedor rechazado', user: fresh });
	} catch (error) {
		next(error);
	}
}

function escapeHtml(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

module.exports = {
	listPendingProviders,
	listApprovedRejectedProviders,
	listApprovedProviders,
	listRejectedProviders,
	approveProvider,
	rejectProvider
};
