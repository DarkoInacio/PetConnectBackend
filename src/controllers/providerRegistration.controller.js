'use strict';

const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const { signToken } = require('../utils/jwt');
const { buildAndValidateProviderProfile } = require('../validators/providerRegistration');
const { notifyAdminsNewProvider } = require('../utils/notifyAdmin');

const uploadsDir = path.join(__dirname, '..', 'uploads');

function unlinkUploadedFiles(files) {
	if (!files || !files.length) return;
	for (const f of files) {
		const p = path.join(uploadsDir, f.filename);
		fs.unlink(p, () => {});
	}
}

async function registerProvider(req, res, next) {
	const files = req.files || [];
	try {
		const { name, lastName, email, password, phone, providerType } = req.body;

		if (!name || !lastName || !email || !password) {
			unlinkUploadedFiles(files);
			return res.status(400).json({ message: 'Campos obligatorios: name, lastName, email, password' });
		}
		if (!phone || !String(phone).trim()) {
			unlinkUploadedFiles(files);
			return res.status(400).json({ message: 'El teléfono es obligatorio para proveedores' });
		}
		if (!providerType) {
			unlinkUploadedFiles(files);
			return res.status(400).json({ message: 'Seleccione el tipo de proveedor (veterinaria, paseador, cuidador)' });
		}

		const normalizedEmail = String(email).toLowerCase().trim();
		const existing = await User.findOne({ email: normalizedEmail });
		if (existing) {
			unlinkUploadedFiles(files);
			if (existing.role === 'dueno') {
				return res.status(409).json({
					message:
						'Este correo ya está registrado como dueño. No puede usar el mismo correo como dueño y proveedor.'
				});
			}
			if (existing.role === 'proveedor') {
				return res.status(409).json({ message: 'El correo ya está registrado como proveedor' });
			}
			return res.status(409).json({ message: 'El correo ya está en uso' });
		}

		const galleryPaths = files.map((f) => `/uploads/${f.filename}`);
		const built = buildAndValidateProviderProfile(providerType, req.body, galleryPaths);
		if (!built.ok) {
			unlinkUploadedFiles(files);
			return res.status(400).json({ message: built.message });
		}

		const user = await User.create({
			name: String(name).trim(),
			lastName: String(lastName).trim(),
			email: normalizedEmail,
			password,
			role: 'proveedor',
			providerType,
			phone: String(phone).trim(),
			status: 'en_revision',
			providerProfile: built.profile
		});

		notifyAdminsNewProvider({
			name: user.name,
			lastName: user.lastName,
			email: user.email,
			providerType: user.providerType,
			phone: user.phone
		}).catch((err) => console.error('notifyAdminsNewProvider:', err.message));

		const token = signToken({ id: user._id, role: user.role });
		return res.status(201).json({
			message: 'Solicitud registrada. Tu perfil queda en revisión; te notificaremos por correo.',
			token,
			user: {
				id: user._id,
				name: user.name,
				lastName: user.lastName,
				email: user.email,
				role: user.role,
				providerType: user.providerType,
				status: user.status,
				providerProfile: user.providerProfile
			}
		});
	} catch (error) {
		unlinkUploadedFiles(files);
		if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
			return res.status(409).json({ message: 'El correo ya está registrado' });
		}
		next(error);
	}
}

module.exports = { registerProvider };
