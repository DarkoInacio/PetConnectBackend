'use strict';

const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { sendEmail } = require('../utils/email');
const { writeAuditLog } = require('../utils/auditLog');

function escapeHtml(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function mapRegistrationDocuments(gallery) {
	if (!Array.isArray(gallery)) return [];
	return gallery
		.filter((p) => typeof p === 'string' && p.trim())
		.map((p) => {
			const path = p.trim().startsWith('/') ? p.trim() : `/${p.trim()}`;
			return {
				url: path,
				label: path.split('/').pop() || 'documento'
			};
		});
}

function serializePendingProvider(doc) {
	const base = { ...doc };
	delete base.password;
	delete base.passwordResetToken;
	delete base.passwordResetExpires;
	return {
		...base,
		requestedAt: doc.createdAt,
		documents: mapRegistrationDocuments(doc.providerProfile?.gallery)
	};
}

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

		const serialized = items.map(serializePendingProvider);

		return res.status(200).json({
			items: serialized,
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit) || 1,
			pendingCount: total
		});
	} catch (error) {
		next(error);
	}
}

async function listActiveProviders(req, res, next) {
	try {
		const page = Math.max(1, parseInt(req.query.page, 10) || 1);
		const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
		const skip = (page - 1) * limit;

		const filter = {
			status: 'aprobado',
			$or: [{ role: 'proveedor' }, { roles: { $in: ['proveedor'] } }]
		};
		const [items, total] = await Promise.all([
			User.find(filter)
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.select('name lastName email phone providerType status createdAt providerProfile.address')
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

async function listSuspendedProviders(req, res, next) {
	try {
		const page = Math.max(1, parseInt(req.query.page, 10) || 1);
		const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
		const skip = (page - 1) * limit;

		const filter = {
			status: 'suspendido',
			$or: [{ role: 'proveedor' }, { roles: { $in: ['proveedor'] } }]
		};
		const [items, total] = await Promise.all([
			User.find(filter)
				.sort({ 'providerProfile.adminSuspendedAt': -1 })
				.skip(skip)
				.limit(limit)
				.select(
					'name lastName email phone providerType status providerProfile.adminSuspendedAt providerProfile.adminSuspendReason'
				)
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
		user.providerProfile.isPublished = true;
		user.providerProfile.rejectionReason = undefined;
		user.providerProfile.reviewedAt = new Date();
		user.providerProfile.reviewedBy = req.user.id;
		user.providerProfile.adminSuspendedAt = undefined;
		user.providerProfile.adminSuspendedBy = undefined;
		user.providerProfile.adminSuspendReason = undefined;
		await user.save();

		await writeAuditLog(req.user.id, 'admin.provider.approve', {
			targetId: user._id,
			metadata: {
				email: user.email,
				providerType: user.providerType
			}
		});

		try {
			await sendEmail({
				to: user.email,
				subject: 'PetConnect: cuenta activada — perfil de proveedor aprobado',
				html: `<p>Hola ${escapeHtml(user.name)},</p>
<p>Tu registro como <strong>${escapeHtml(user.providerType || '')}</strong> fue <strong>aprobado</strong>. Tu perfil ya puede ser visible en el mapa y en el buscador de PetConnect según la información que hayas publicado.</p>
<p>Puedes iniciar sesión con tu cuenta y continuar configurando tu perfil.</p>
<p>Saludos,<br>PetConnect</p>`
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
		if (reason.length > 2000) {
			return res.status(400).json({ message: 'El motivo no puede superar 2000 caracteres' });
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

		await writeAuditLog(req.user.id, 'admin.provider.reject', {
			targetId: user._id,
			metadata: {
				email: user.email,
				providerType: user.providerType,
				reasonPreview: reason.slice(0, 200)
			}
		});

		try {
			const bodyDual = isDual
				? `<p>Tu cuenta de <strong>dueño</strong> sigue activa. Puedes volver a enviar una solicitud más adelante.</p>`
				: '';
			await sendEmail({
				to: user.email,
				subject: 'PetConnect: actualización sobre tu solicitud de proveedor',
				html: `<p>Hola ${escapeHtml(user.name || '')},</p><p>Lamentamos informarte que tu solicitud como <strong>${escapeHtml(
					String(providerTypeLabel || 'proveedor')
				)}</strong> no ha sido aprobada.</p><p><strong>Motivo:</strong></p><p>${escapeHtml(
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

async function suspendProvider(req, res, next) {
	try {
		const reason = req.body?.reason != null ? String(req.body.reason).trim() : '';
		if (reason.length > 2000) {
			return res.status(400).json({ message: 'El motivo no puede superar 2000 caracteres' });
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
		if (user.status !== 'aprobado') {
			return res.status(400).json({ message: 'Solo se pueden desactivar proveedores activos (aprobados)' });
		}

		user.status = 'suspendido';
		if (!user.providerProfile) user.providerProfile = {};
		user.providerProfile.adminSuspendedAt = new Date();
		user.providerProfile.adminSuspendedBy = req.user.id;
		user.providerProfile.adminSuspendReason = reason || undefined;
		await user.save();

		await writeAuditLog(req.user.id, 'admin.provider.suspend', {
			targetId: user._id,
			metadata: {
				email: user.email,
				reason: reason || null
			}
		});

		const fresh = await User.findById(user._id).select('-password -passwordResetToken -passwordResetExpires');
		return res.status(200).json({
			message: 'Perfil desactivado temporalmente: ya no aparece en mapa ni buscador.',
			user: fresh
		});
	} catch (error) {
		next(error);
	}
}

async function reactivateProvider(req, res, next) {
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
		if (user.status !== 'suspendido') {
			return res.status(400).json({ message: 'El proveedor no está desactivado por administración' });
		}

		user.status = 'aprobado';
		if (!user.providerProfile) user.providerProfile = {};
		user.providerProfile.adminSuspendedAt = undefined;
		user.providerProfile.adminSuspendedBy = undefined;
		user.providerProfile.adminSuspendReason = undefined;
		await user.save();

		await writeAuditLog(req.user.id, 'admin.provider.reactivate', {
			targetId: user._id,
			metadata: { email: user.email }
		});

		const fresh = await User.findById(user._id).select('-password -passwordResetToken -passwordResetExpires');
		return res.status(200).json({ message: 'Proveedor reactivado', user: fresh });
	} catch (error) {
		next(error);
	}
}

async function listAuditLogs(req, res, next) {
	try {
		const page = Math.max(1, parseInt(req.query.page, 10) || 1);
		const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
		const skip = (page - 1) * limit;

		const [items, total] = await Promise.all([
			AuditLog.find({})
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.populate('actorId', 'name lastName email')
				.lean(),
			AuditLog.countDocuments({})
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

module.exports = {
	listPendingProviders,
	listActiveProviders,
	listSuspendedProviders,
	approveProvider,
	rejectProvider,
	suspendProvider,
	reactivateProvider,
	listAuditLogs
};
