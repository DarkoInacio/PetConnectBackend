'use strict';

const User = require('../models/User');

// Obtener mi perfil
async function getMyProfile(req, res, next) {
	try {
		const user = await User.findById(req.user.id).select('-password -passwordResetToken -passwordResetExpires');
		if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
		return res.status(200).json({ user });
	} catch (error) {
		next(error);
	}
}

// Actualizar mi perfil (no permite cambiar email)
async function updateMyProfile(req, res, next) {
	try {
		const disallowed = ['email', 'password', 'role', 'status'];
		for (const key of disallowed) {
			if (key in req.body) {
				return res.status(400).json({ message: `No se permite editar el campo: ${key}` });
			}
		}

		const updates = {
			name: req.body.name,
			lastName: req.body.lastName,
			phone: req.body.phone
		};

		// Imagen de perfil (si se subió)
		if (req.file) {
			updates.profileImage = `/uploads/${req.file.filename}`;
		}

		// Limpiar campos no definidos
		Object.keys(updates).forEach((k) => updates[k] === undefined && delete updates[k]);

		const user = await User.findByIdAndUpdate(req.user.id, updates, {
			new: true,
			runValidators: true,
			select: '-password -passwordResetToken -passwordResetExpires'
		});

		return res.status(200).json({ message: 'Perfil actualizado', user });
	} catch (error) {
		next(error);
	}
}

module.exports = { getMyProfile, updateMyProfile };