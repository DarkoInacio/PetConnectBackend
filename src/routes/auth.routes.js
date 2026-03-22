'use strict';

const express = require('express');
const router = express.Router();
const { register, login, forgotPassword, resetPassword } = require('../controllers/auth.controller');

// Registro
router.post('/register', register);

// Login
router.post('/login', login);

// Recuperación de contraseña
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;