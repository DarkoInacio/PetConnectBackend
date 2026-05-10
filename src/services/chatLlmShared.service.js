'use strict';

const { buildVetSystemPrompt, DISCLAIMER } = require('./vetTriagePrompt');

function buildMessages({ historyMessages, userMessage, triageContext } = {}) {
	const userContent = triageContext
		? `${triageContext}\n\nMensaje del dueño: ${userMessage}`
		: userMessage;
	return [
		{ role: 'system', content: buildVetSystemPrompt() },
		...historyMessages,
		{ role: 'user', content: userContent }
	];
}

/**
 * @returns {{ reply: string, urgencyLevel: 'verde'|'amarillo'|'rojo' } | null}
 */
function tryParseJsonChatResponse(raw) {
	if (raw == null) return null;
	let s = String(raw).trim();
	if (s.startsWith('```')) {
		s = s.replace(/^```(?:json)?\n?/i, '').replace(/\n?```\s*$/i, '');
	}
	let obj;
	try {
		obj = JSON.parse(s);
	} catch {
		return null;
	}
	if (!obj || typeof obj !== 'object') return null;
	const u = String(obj.urgencyLevel || obj.urgence || '')
		.toUpperCase()
		.trim();
	let urgencyLevel = 'verde';
	if (u === 'RED' || u === 'R') urgencyLevel = 'rojo';
	else if (u === 'YELLOW' || u === 'Y' || u === 'AMARILLO') urgencyLevel = 'amarillo';
	else if (u === 'GREEN' || u === 'G' || u === 'VERDE') urgencyLevel = 'verde';
	else if (u.includes('RED')) urgencyLevel = 'rojo';
	else if (u.includes('YELLOW') || u.includes('AMARILL')) urgencyLevel = 'amarillo';
	else if (u.includes('GREEN') || u.includes('VERD')) urgencyLevel = 'verde';
	const reply = String(obj.reply || obj.message || '').trim();
	if (!reply) return null;
	if (!String(reply).includes(DISCLAIMER)) {
		return { reply: `${reply}\n\n${DISCLAIMER}`, urgencyLevel };
	}
	return { reply, urgencyLevel };
}

function mergeUrgencyLevels(...levels) {
	const order = { verde: 0, amarillo: 1, rojo: 2 };
	const list = levels.filter((x) => x && order[x] !== undefined);
	if (list.length === 0) return 'verde';
	return list.reduce((a, b) => (order[b] > order[a] ? b : a));
}

module.exports = {
	DISCLAIMER,
	buildMessages,
	tryParseJsonChatResponse,
	mergeUrgencyLevels: mergeUrgencyLevels
};
