'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const { listUnifiedMine } = require('../controllers/bookings.controller');

router.get('/mine', auth, authorizeRoles('dueno'), listUnifiedMine);

module.exports = router;
