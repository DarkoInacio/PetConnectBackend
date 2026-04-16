'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const {
	getProviderPublicProfile,
	listApprovedProviders,
	searchProviders,
	getProvidersMapData,
	updateMyProviderProfile
} = require('../controllers/providers.controller');

router.put('/mi-perfil', auth, authorizeRoles('proveedor'), updateMyProviderProfile);

router.get('/buscar', searchProviders);
router.get('/mapa', getProvidersMapData);

router.get('/', listApprovedProviders);

router.get('/:id/perfil', getProviderPublicProfile);

module.exports = router;
