/**
 * Crea o promueve un usuario administrador (solo entorno conectado a MongoDB).
 * Uso: node scripts/create-admin.js
 * Variables (opcionales, ver .env.example):
 *   MONGODB_URI
 *   ADMIN_SEED_EMAIL
 *   ADMIN_SEED_PASSWORD
 */
'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

async function main() {
	const uri = process.env.MONGODB_URI;
	if (!uri) {
		console.error('Falta MONGODB_URI en .env');
		process.exit(1);
	}

	const email = String(process.env.ADMIN_SEED_EMAIL || 'admin@petconnect.local')
		.toLowerCase()
		.trim();
	const defaultPass = 'AdminPetConnect2026!';
	const password = process.env.ADMIN_SEED_PASSWORD || defaultPass;

	if (password.length < 6) {
		console.error('La contraseña debe tener al menos 6 caracteres (ADMIN_SEED_PASSWORD).');
		process.exit(1);
	}

	const forceReset =
		process.env.FORCE_ADMIN_PASSWORD === '1' || process.env.RESET_ADMIN_PASSWORD === '1';
	const passToSet = forceReset ? (process.env.ADMIN_SEED_PASSWORD || defaultPass) : password;

	await mongoose.connect(uri);

	const existing = await User.findOne({ email }).select('+password');
	/** @type {boolean} */
	let canShowPassword = true;

	if (existing) {
		if (existing.role === 'admin') {
			if (forceReset) {
				existing.password = passToSet;
				await existing.save();
				console.log('Contraseña de admin restablecida (FORCE_ADMIN_PASSWORD=1 o RESET_ADMIN_PASSWORD=1).');
			} else {
				console.log('Ya existe un administrador con el correo:', email);
				console.log(
					'Si el login falla, añade al .env: FORCE_ADMIN_PASSWORD=1 (y opcionalmente ADMIN_SEED_PASSWORD=tuClave) y vuelve a ejecutar: npm run seed:admin'
				);
				canShowPassword = false;
			}
		} else {
			existing.role = 'admin';
			existing.status = 'activo';
			existing.password = password;
			await existing.save();
			console.log('Usuario existente promovido a admin y contraseña actualizada:', email);
		}
	} else {
		await User.create({
			name: 'Admin',
			lastName: 'PetConnect',
			email,
			password,
			role: 'admin',
			status: 'activo'
		});
		console.log('Administrador creado correctamente.');
	}

	console.log('');
	if (canShowPassword) {
		console.log('--- Acceso panel admin (solo desarrollo; cambia la clave en producción) ---');
		console.log('Correo:    ', email);
		console.log('Contraseña:', password);
		console.log('------------------------------------------------------------------------');
	} else {
		console.log('Correo del admin existente:', email);
	}
	console.log('Front: Iniciar sesión → ruta /admin/proveedores');

	await mongoose.disconnect();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
