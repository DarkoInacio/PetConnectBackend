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
const { listReports, decideReport } = require('../controllers/adminReviewReports.controller');

router.get('/providers/pending', auth, authorizeRoles('admin'), listPendingProviders);
router.patch('/providers/:userId/approve', auth, authorizeRoles('admin'), approveProvider);
router.patch('/providers/:userId/reject', auth, authorizeRoles('admin'), rejectProvider);

router.get('/review-reports', auth, authorizeRoles('admin'), listReports);
router.patch('/review-reports/:reportId', auth, authorizeRoles('admin'), decideReport);

module.exports = router;
