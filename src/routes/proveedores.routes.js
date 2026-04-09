'use strict';

const express = require('express');
const router = express.Router();
const { getProviderPublicProfile } = require('../controllers/proveedores.controller');

router.get('/:id/perfil', getProviderPublicProfile);

module.exports = router;
