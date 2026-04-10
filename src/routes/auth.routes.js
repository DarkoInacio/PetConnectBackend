'use strict';

const express = require('express');
const router = express.Router();
const { register, login, forgotPassword, resetPassword } = require('../controllers/auth.controller');
const { registerProvider } = require('../controllers/providerRegistration.controller');
const { uploadProviderGallery } = require('../config/multer');

// Registro
router.post('/register', register);

// Registro proveedor (multipart: hasta 3 fotos en campo "photos")
router.post(
	'/register-provider',
	uploadProviderGallery.array('photos', 3),
	registerProvider
);

// Login
router.post('/login', login);

// Recuperación de contraseña
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;