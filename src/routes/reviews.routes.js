'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const { updateReview } = require('../controllers/reviewWrite.controller');

router.patch('/:id', auth, authorizeRoles('dueno', 'proveedor'), updateReview);

module.exports = router;
