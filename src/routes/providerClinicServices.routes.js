'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const { listMine, createMine, updateMine } = require('../controllers/providerClinicServices.controller');

router.use(auth, authorizeRoles('proveedor'));
router.get('/', listMine);
router.post('/', createMine);
router.patch('/:id', updateMine);

module.exports = router;
