'use strict';

const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/profile', require('./profile.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/proveedores', require('./proveedores.routes'));
router.use('/citas', require('./citas.routes'));

module.exports = router;