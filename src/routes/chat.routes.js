'use strict';

const express = require('express');
const optionalAuth = require('../middlewares/optionalAuth');
const { postChat } = require('../controllers/chat.controller');

const router = express.Router();

// Visitantes y usuarios logueados (token opcional)
router.post('/', optionalAuth, postChat);

module.exports = router;

