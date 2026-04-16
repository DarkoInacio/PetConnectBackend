'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const { listUnifiedMine, listUnifiedProviderMine } = require('../controllers/bookings.controller');

router.get('/provider/mine', auth, authorizeRoles('proveedor'), listUnifiedProviderMine);
router.get('/mine', auth, authorizeRoles('dueno'), listUnifiedMine);

module.exports = router;
