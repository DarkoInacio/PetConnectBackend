'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const {
	listProviderOwnReviews,
	notImplementedProviderReviewReply
} = require('../controllers/providerReviews.controller');

router.get('/reviews', auth, authorizeRoles('proveedor'), listProviderOwnReviews);
router.put('/reviews/:id/reply', auth, authorizeRoles('proveedor'), notImplementedProviderReviewReply);

module.exports = router;
