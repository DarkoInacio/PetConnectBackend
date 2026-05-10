'use strict';

const express = require('express');
const router = express.Router();

const optionalAuth = require('../middlewares/optionalAuth');
const { postChatbotMessage, postChatbotTriage } = require('../controllers/chatbot.controller');

// Chatbot de orientación (salud animal)
router.post('/message', optionalAuth, postChatbotMessage);
router.post('/triage', postChatbotTriage);

module.exports = router;

