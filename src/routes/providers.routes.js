'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const {
	getProviderPublicProfile,
	getProviderPublicProfileBySlug,
	listApprovedProviders,
	searchProviders,
	getProvidersMapData,
	updateMyProviderProfile,
	requestWalkerService
} = require('../controllers/providers.controller');
const { listProviderReviews } = require('../controllers/providerReviews.controller');

router.put('/mi-perfil', auth, authorizeRoles('proveedor'), updateMyProviderProfile);

router.post('/solicitar-servicio', auth, authorizeRoles('dueno'), requestWalkerService);

router.get('/buscar', searchProviders);
router.get('/mapa', getProvidersMapData);

router.get('/perfil/:tipo/:slug', getProviderPublicProfileBySlug);

router.get('/', listApprovedProviders);

router.get('/:providerId/reviews', listProviderReviews);

router.get('/:id/perfil', getProviderPublicProfile);

module.exports = router;
