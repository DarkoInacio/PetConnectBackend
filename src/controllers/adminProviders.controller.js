'use strict';

const User = require('../models/User');
const { sendEmail } = require('../utils/email');

async function listPendingProviders(req, res, next) {
	try {
		const page = Math.max(1, parseInt(req.query.page, 10) || 1);
		const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
		const skip = (page - 1) * limit;

		const filter = {
			status: 'en_revision',
			$or: [{ role: 'proveedor' }, { roles: { $in: ['proveedor'] } }]
		};
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

async function approveProvider(req, res, next) {
	try {
		const user = await User.findById(req.params.userId);
		if (!user) {
			return res.status(404).json({ message: 'Usuario no encontrado' });
		}
		const hasProvider =
			user.role === 'proveedor' || (Array.isArray(user.roles) && user.roles.includes('proveedor'));
		if (!hasProvider) {
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
		const hasProvider =
			user.role === 'proveedor' || (Array.isArray(user.roles) && user.roles.includes('proveedor'));
		if (!hasProvider) {
			return res.status(400).json({ message: 'El usuario no es proveedor' });
		}
		if (user.status !== 'en_revision') {
			return res.status(400).json({ message: 'El proveedor no está en revisión' });
		}

		const eff = user.roles && user.roles.length > 0 ? user.roles : [user.role];
		const isDual = eff.includes('dueno') && eff.includes('proveedor');
		const providerTypeLabel = user.providerType;

		if (isDual) {
			user.roles = ['dueno'];
			user.role = 'dueno';
			user.status = 'activo';
			user.providerType = null;
			user.providerProfile = {
				rejectionReason: reason,
				reviewedAt: new Date(),
				reviewedBy: req.user.id
			};
		} else {
			user.status = 'rechazado';
			if (!user.providerProfile) {
				user.providerProfile = {};
			}
			user.providerProfile.rejectionReason = reason;
			user.providerProfile.reviewedAt = new Date();
			user.providerProfile.reviewedBy = req.user.id;
		}
		await user.save();

		try {
			const bodyDual = isDual
				? `<p>Tu cuenta de <strong>dueño</strong> sigue activa. Puedes volver a enviar una solicitud más adelante.</p>`
				: '';
			await sendEmail({
				to: user.email,
				subject: 'PetConnect: actualización sobre tu solicitud de proveedor',
				html: `<p>Hola ${user.name},</p><p>Lamentamos informarte que tu solicitud como <strong>${providerTypeLabel || 'proveedor'}</strong> no ha sido aprobada.</p><p><strong>Motivo:</strong></p><p>${escapeHtml(
					reason
				)}</p>${bodyDual}<p>Si crees que es un error, contacta a soporte.</p><p>PetConnect</p>`
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

module.exports = { listPendingProviders, approveProvider, rejectProvider };
