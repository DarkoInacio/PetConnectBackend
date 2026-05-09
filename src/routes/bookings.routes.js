'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const ensureVeterinariaProvider = require('../middlewares/ensureVeterinariaProvider');
const { listMyBookings, listProviderBookings } = require('../controllers/bookings.controller');
const { getVetProviderSummary } = require('../controllers/providerVetStats.controller');

router.get('/mine', auth, authorizeRoles('dueno'), listMyBookings);
router.get('/provider/mine', auth, authorizeRoles('proveedor'), listProviderBookings);
router.get('/provider/vet-summary', auth, authorizeRoles('proveedor'), ensureVeterinariaProvider, getVetProviderSummary);

module.exports = router;
