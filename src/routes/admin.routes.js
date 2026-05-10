'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const {
	listPendingProviders,
	listActiveProviders,
	listSuspendedProviders,
	approveProvider,
	rejectProvider,
	suspendProvider,
	reactivateProvider,
	listAuditLogs
} = require('../controllers/adminProviders.controller');
const { listReports, decideReport } = require('../controllers/adminReviewReports.controller');

router.get('/providers/pending', auth, authorizeRoles('administrador'), listPendingProviders);
router.get('/providers/active', auth, authorizeRoles('administrador'), listActiveProviders);
router.get('/providers/suspended', auth, authorizeRoles('administrador'), listSuspendedProviders);
router.patch('/providers/:userId/approve', auth, authorizeRoles('administrador'), approveProvider);
router.patch('/providers/:userId/reject', auth, authorizeRoles('administrador'), rejectProvider);
router.patch('/providers/:userId/suspend', auth, authorizeRoles('administrador'), suspendProvider);
router.patch('/providers/:userId/reactivate', auth, authorizeRoles('administrador'), reactivateProvider);
router.get('/audit-logs', auth, authorizeRoles('administrador'), listAuditLogs);

router.get('/review-reports', auth, authorizeRoles('admin'), listReports);
router.patch('/review-reports/:reportId', auth, authorizeRoles('admin'), decideReport);

module.exports = router;
