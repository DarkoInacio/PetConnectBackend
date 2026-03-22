'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const USER_ROLES = ['dueno', 'proveedor', 'admin'];
const PROVIDER_STATUSES = ['en_revision', 'aprobado', 'rechazado'];

const userSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: true,
			trim: true
		},
		lastName: {
			type: String,
			required: true,
			trim: true
		},
		email: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true
		},
		password: {
			type: String,
			required: true,
			minlength: 6,
			select: false
		},
		role: {
			type: String,
			enum: USER_ROLES,
			default: 'dueno',
			index: true
		},
		providerType: {
			type: String,
			default: null // Ej: veterinaria, paseador, cuidador
		},
		phone: {
			type: String,
			trim: true
		},
		profileImage: {
			type: String // Ruta relativa en /uploads
		},
		status: {
			type: String,
			enum: PROVIDER_STATUSES.concat(['activo']), // 'activo' para dueños/admin
			default: function () {
				return this.role === 'proveedor' ? 'en_revision' : 'activo';
			}
		},
		passwordResetToken: String,
		passwordResetExpires: Date
	},
	{
		timestamps: true
	}
);

// Hash de contraseña si fue modificada
userSchema.pre('save', async function (next) {
	if (!this.isModified('password')) return next();
	const salt = await bcrypt.genSalt(10);
	this.password = await bcrypt.hash(this.password, salt);
	next();
});

// Método de instancia para comparar contraseña
userSchema.methods.comparePassword = async function (candidatePassword) {
	return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
module.exports.USER_ROLES = USER_ROLES;