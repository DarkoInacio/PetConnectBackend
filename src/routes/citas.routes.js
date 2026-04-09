'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const { createCita } = require('../controllers/citas.controller');

router.post('/', auth, authorizeRoles('dueno'), createCita);

module.exports = router;
