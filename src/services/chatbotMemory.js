'use strict';

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 min
const DEFAULT_MAX_MESSAGES = 12;

/** @type {Map<string, { expiresAt: number, messages: Array<{ role: 'user'|'assistant', content: string }> }>} */
const mem = new Map();

function now() {
	return Date.now();
}

function cleanup() {
	const t = now();
	for (const [key, value] of mem.entries()) {
		if (!value || value.expiresAt <= t) mem.delete(key);
	}
}

function getConversation(conversationId) {
	cleanup();
	const v = mem.get(conversationId);
	if (!v) return null;
	if (v.expiresAt <= now()) {
		mem.delete(conversationId);
		return null;
	}
	return v;
}

function upsertConversation(conversationId, updater, { ttlMs = DEFAULT_TTL_MS } = {}) {
	cleanup();
	const existing = getConversation(conversationId) || { expiresAt: now() + ttlMs, messages: [] };
	const next = updater(existing) || existing;
	next.expiresAt = now() + ttlMs;
	mem.set(conversationId, next);
	return next;
}

function pushMessage(conversationId, msg, { ttlMs = DEFAULT_TTL_MS, maxMessages = DEFAULT_MAX_MESSAGES } = {}) {
	return upsertConversation(
		conversationId,
		(conv) => {
			conv.messages.push(msg);
			if (conv.messages.length > maxMessages) {
				conv.messages = conv.messages.slice(conv.messages.length - maxMessages);
			}
			return conv;
		},
		{ ttlMs }
	);
}

module.exports = { getConversation, pushMessage };

