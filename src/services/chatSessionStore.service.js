'use strict';

const crypto = require('crypto');

function createSessionId() {
	// No es un secreto, solo un identificador aleatorio de sesión.
	return crypto.randomBytes(16).toString('hex');
}

class ChatSessionStore {
	constructor({ ttlMs = 30 * 60 * 1000, maxMessages = 20 } = {}) {
		this.ttlMs = ttlMs;
		this.maxMessages = maxMessages;
		this.sessions = new Map(); // sessionId -> { messages, updatedAt, userId? }
		this._sweepTimer = null;
	}

	startSweeper({ intervalMs = 60 * 1000 } = {}) {
		if (this._sweepTimer) return;
		this._sweepTimer = setInterval(() => this.sweep(), intervalMs);
		// No bloquear cierre del proceso
		this._sweepTimer.unref?.();
	}

	stopSweeper() {
		if (!this._sweepTimer) return;
		clearInterval(this._sweepTimer);
		this._sweepTimer = null;
	}

	sweep() {
		const now = Date.now();
		for (const [sessionId, s] of this.sessions.entries()) {
			if (!s?.updatedAt || now - s.updatedAt > this.ttlMs) {
				this.sessions.delete(sessionId);
			}
		}
	}

	getOrCreate(sessionId, { userId } = {}) {
		const now = Date.now();
		if (sessionId && this.sessions.has(sessionId)) {
			const existing = this.sessions.get(sessionId);
			existing.updatedAt = now;
			if (userId && !existing.userId) existing.userId = userId;
			return { sessionId, session: existing, isNew: false };
		}

		const newId = sessionId || createSessionId();
		const session = {
			messages: [],
			updatedAt: now,
			userId: userId || null
		};
		this.sessions.set(newId, session);
		return { sessionId: newId, session, isNew: true };
	}

	appendMessage(sessionId, message) {
		if (!sessionId) return;
		const s = this.sessions.get(sessionId);
		if (!s) return;
		s.messages.push(message);
		if (s.messages.length > this.maxMessages) {
			s.messages.splice(0, s.messages.length - this.maxMessages);
		}
		s.updatedAt = Date.now();
	}

	getMessages(sessionId) {
		const s = this.sessions.get(sessionId);
		return s?.messages || [];
	}

	/** Borra la sesión (nueva conversación en el cliente). */
	destroySession(sessionId) {
		if (sessionId) {
			this.sessions.delete(sessionId);
		}
	}
}

module.exports = {
	ChatSessionStore
};

