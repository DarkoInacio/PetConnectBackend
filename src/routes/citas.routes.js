'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const { createCita, getMisCitas, getProximasCitas } = require('../controllers/citas.controller');

router.post('/', auth, authorizeRoles('dueno'), createCita);

router.get('/mis-citas', auth, authorizeRoles('dueno'), getMisCitas);

router.get('/proximas', auth, authorizeRoles('dueno'), getProximasCitas);

module.exports = router;
