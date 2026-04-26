'use strict';

const { callOpenAiChat } = require('./openaiChat.service');

async function callChatLlm(opts) {
	return callOpenAiChat(opts);
}

module.exports = {
	callChatLlm
};
