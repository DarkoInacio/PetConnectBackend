'use strict';

const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const { runReminders24hNow } = require('../controllers/adminJobs.controller');

router.post('/reminders24h/run', auth, authorizeRoles('admin'), runReminders24hNow);

module.exports = router;
