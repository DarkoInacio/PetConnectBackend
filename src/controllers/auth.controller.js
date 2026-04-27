'use strict';

const crypto = require('crypto');
const User = require('../models/User');
const { signToken } = require('../utils/jwt');
const { sendEmail } = require('../utils/email');

// Registro de usuario (dueño o admin manual; proveedores usan POST /api/auth/register-provider)
async function register(req, res, next) {
	try {
		const { name, lastName, email, password, role, phone } = req.body;
		if (!name || !lastName || !email || !password) {
			return res.status(400).json({ message: 'Campos obligatorios: name, lastName, email, password' });
		}
		const normalizedRole = role || 'dueno';
		if (!['dueno', 'proveedor', 'admin'].includes(normalizedRole)) {
			return res.status(400).json({ message: 'Rol inválido' });
		}
		if (normalizedRole === 'proveedor') {
			return res.status(400).json({
				message:
					'Para registrarse como veterinaria, paseador o cuidador use POST /api/auth/register-provider con el formulario completo.'
			});
		}
		if (normalizedRole === 'admin') {
			return res.status(403).json({ message: 'No está permitido crear cuentas administrador por esta ruta.' });
		}

		const normalizedEmail = String(email).toLowerCase().trim();
		const existing = await User.findOne({ email: normalizedEmail });
		if (existing) {
			if (existing.role === 'proveedor') {
				return res.status(409).json({
					message:
						'Este correo ya está registrado como proveedor. Use otro correo para registrarse como dueño.'
				});
			}
			return res.status(409).json({ message: 'El correo ya está registrado' });
		}

		const user = await User.create({
			name: String(name).trim(),
			lastName: String(lastName).trim(),
			email: normalizedEmail,
			password,
			role: normalizedRole,
			providerType: null,
			phone: phone ? String(phone).trim() : undefined
		});

		const token = signToken({ id: user._id, role: user.role });
		return res.status(201).json({
			message: 'Usuario registrado correctamente',
			token,
			user: {
				id: user._id,
				name: user.name,
				lastName: user.lastName,
				email: user.email,
				role: user.role,
				status: user.status
			}
		});
	} catch (error) {
		if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
			return res.status(409).json({ message: 'El correo ya está registrado' });
		}
		next(error);
	}
}

// Login
async function login(req, res, next) {
	try {
		const { email, password } = req.body;
		if (!email || !password) {
			return res.status(400).json({ message: 'Email y password son obligatorios' });
		}
		const user = await User.findOne({ email }).select('+password');
		if (!user) {
			return res.status(400).json({ message: 'Credenciales inválidas' });
		}
		const valid = await user.comparePassword(password);
		if (!valid) {
			return res.status(400).json({ message: 'Credenciales inválidas' });
		}
		const token = signToken({ id: user._id, role: user.role });
		return res.status(200).json({
			message: 'Login exitoso',
			token,
			user: {
				id: user._id,
				name: user.name,
				lastName: user.lastName,
				email: user.email,
				role: user.role,
				status: user.status,
				...(user.role === 'proveedor' ? { providerType: user.providerType } : {})
			}
		});
	} catch (error) {
		next(error);
	}
}

// Recuperación de contraseña (solicitud)
async function forgotPassword(req, res, next) {
	try {
		const { email } = req.body;
		if (!email) {
			return res.status(400).json({ message: 'Email es obligatorio' });
		}
		const user = await User.findOne({ email });
		if (!user) {
			// Para evitar enumeración de usuarios, respondemos igual
			return res.status(200).json({ message: 'Si el correo existe, enviaremos instrucciones' });
		}
		const resetToken = crypto.randomBytes(32).toString('hex');
		const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
		user.passwordResetToken = resetTokenHash;
		user.passwordResetExpires = new Date(Date.now() + 1000 * 60 * 30); // 30 minutos
		await user.save();

		const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}&email=${encodeURIComponent(
			user.email
		)}`;

		// En desarrollo devolvemos el link directamente para facilitar pruebas
		// sin depender de un proveedor SMTP configurado.
		if (process.env.NODE_ENV !== 'production') {
			return res.status(200).json({
				message: 'Link de recuperación generado (modo desarrollo)',
				resetUrl
			});
		}

		await sendEmail({
			to: user.email,
			subject: 'Recuperación de contraseña',
			html: `<p>Hola ${user.name},</p><p>Para restablecer tu contraseña haz clic en el siguiente enlace:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Si no solicitaste este cambio, ignora este correo.</p>`
		});

		return res.status(200).json({ message: 'Si el correo existe, enviaremos instrucciones' });
	} catch (error) {
		if (error.code === 'MAIL_CONFIG_MISSING') {
			return res.status(500).json({ message: error.message });
		}
		if (
			error &&
			(error.responseCode === 535 ||
				error.code === 'EAUTH' ||
				(typeof error.message === 'string' && error.message.includes('Invalid login')))
		) {
			return res.status(500).json({
				message: 'No se pudo enviar el correo de recuperación. Revisa MAIL_USER y MAIL_PASS del backend.'
			});
		}
		next(error);
	}
}

// Restablecer contraseña
async function resetPassword(req, res, next) {
	try {
		const { email, token, newPassword } = req.body;
		if (!email || !token || !newPassword) {
			return res.status(400).json({ message: 'Campos obligatorios: email, token, newPassword' });
		}
		const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
		const user = await User.findOne({
			email,
			passwordResetToken: tokenHash,
			passwordResetExpires: { $gt: new Date() }
		}).select('+password');

		if (!user) {
			return res.status(400).json({ message: 'Token inválido o expirado' });
		}

		user.password = newPassword;
		user.passwordResetToken = undefined;
		user.passwordResetExpires = undefined;
		await user.save();

		return res.status(200).json({ message: 'Contraseña actualizada correctamente' });
	} catch (error) {
		next(error);
	}
}

module.exports = { register, login, forgotPassword, resetPassword };