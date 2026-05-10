'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const { listProviderReviewsForMe, upsertProviderReply } = require('../controllers/providerReplies.controller');

router.get('/', auth, authorizeRoles('proveedor'), listProviderReviewsForMe);
router.put('/:reviewId/reply', auth, authorizeRoles('proveedor'), upsertProviderReply);

module.exports = router;
