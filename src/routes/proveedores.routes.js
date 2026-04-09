'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const {
	getProviderPublicProfile,
	listApprovedProviders,
	updateMyProviderProfile
} = require('../controllers/proveedores.controller');

router.put('/mi-perfil', auth, authorizeRoles('proveedor'), updateMyProviderProfile);

router.get('/', listApprovedProviders);

router.get('/:id/perfil', getProviderPublicProfile);

module.exports = router;
