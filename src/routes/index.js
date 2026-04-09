'use strict';

const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/profile', require('./profile.routes'));
router.use('/provider/agenda', require('./providerAgenda.routes'));
router.use('/appointments', require('./appointments.routes'));
router.use('/admin/jobs', require('./adminJobs.routes'));

module.exports = router;