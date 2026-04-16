'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const {
	listPendingProviders,
	listApprovedRejectedProviders,
	listApprovedProviders,
	listRejectedProviders,
	approveProvider,
	rejectProvider
} = require('../controllers/adminProviders.controller');

router.get('/providers/pending', auth, authorizeRoles('admin'), listPendingProviders);
router.get('/providers', auth, authorizeRoles('admin'), listApprovedRejectedProviders);
router.get('/providers/approved', auth, authorizeRoles('admin'), listApprovedProviders);
router.get('/providers/rejected', auth, authorizeRoles('admin'), listRejectedProviders);
router.patch('/providers/:userId/approve', auth, authorizeRoles('admin'), approveProvider);
router.patch('/providers/:userId/reject', auth, authorizeRoles('admin'), rejectProvider);

module.exports = router;
