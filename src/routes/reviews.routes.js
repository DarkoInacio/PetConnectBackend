'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const { updateMyReview } = require('../controllers/ownerReviews.controller');
const { createReport } = require('../controllers/reviewReports.controller');

router.patch('/:reviewId', auth, authorizeRoles('dueno'), updateMyReview);
router.post('/:reviewId/report', auth, createReport);

module.exports = router;
