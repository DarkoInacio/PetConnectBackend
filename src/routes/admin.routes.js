'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const {
	listPendingProviders,
	approveProvider,
	rejectProvider
} = require('../controllers/adminProviders.controller');

router.get('/providers/pending', auth, authorizeRoles('admin'), listPendingProviders);
router.patch('/providers/:userId/approve', auth, authorizeRoles('admin'), approveProvider);
router.patch('/providers/:userId/reject', auth, authorizeRoles('admin'), rejectProvider);

module.exports = router;
