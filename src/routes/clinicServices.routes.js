'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const {
	listClinicServices,
	createClinicService,
	updateClinicService
} = require('../controllers/clinicServices.controller');

router.use(auth, authorizeRoles('proveedor'));

router.get('/', listClinicServices);
router.post('/', createClinicService);
router.patch('/:id', updateClinicService);

module.exports = router;
