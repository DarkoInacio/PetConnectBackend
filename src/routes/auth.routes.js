'use strict';

const express = require('express');
const router = express.Router();
const { register, login, forgotPassword, resetPassword } = require('../controllers/auth.controller');
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const { registerProvider, upgradeOwnerToProvider } = require('../controllers/providerRegistration.controller');
const { uploadProviderGallery } = require('../config/multer');

// Registro
router.post('/register', register);

// Registro proveedor (multipart: hasta 3 fotos en campo "photos")
router.post(
	'/register-provider',
	uploadProviderGallery.array('photos', 3),
	registerProvider
);

/** Dueño con sesión: añade rol proveedor (mismo correo), sin segundo registro */
router.post(
	'/upgrade-to-provider',
	auth,
	authorizeRoles('dueno'),
	uploadProviderGallery.array('photos', 3),
	upgradeOwnerToProvider
);

// Login
router.post('/login', login);

// Recuperación de contraseña
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;