'use strict';

const { detectUrgencyLevel } = require('../utils/urgencyDetector');
const { DISCLAIMER } = require('../services/vetTriagePrompt');
const { buildMessages, mergeUrgencyLevels } = require('../services/chatLlmShared.service');
const { callChatLlm } = require('../services/chatLlmProvider.service');
const {
	ensureTriage,
	maybeExtractFromMessage,
	buildTriageContextForModel,
	buildWarmOfflineReply,
	buildPetAcknowledgment
} = require('../services/triageState.service');

const { ChatSessionStore } = require('../services/chatSessionStore.service');

const chatStore = new ChatSessionStore({
	ttlMs: Number(process.env.CHAT_SESSION_TTL_MS || 30 * 60 * 1000),
	maxMessages: Number(process.env.CHAT_SESSION_MAX_MESSAGES || 20)
});
chatStore.startSweeper({ intervalMs: 60 * 1000 });

function buildActions({ urgencyLevel }) {
	const actions = [
		{ id: 'buscar_veterinarias', label: 'Buscar veterinarias', type: 'link', href: '/explorar?tipo=veterinaria' },
		// Agendar requiere elegir primero una clínica (providerId). Enviamos al directorio.
		{ id: 'agendar_cita', label: 'Agendar cita', type: 'link', href: '/explorar?tipo=veterinaria' },
	];
	if (urgencyLevel === 'rojo') {
		actions.unshift({
			id: 'emergencia_247_cerca',
			label: 'Emergencia 24/7 cerca',
			type: 'link',
			href: '/explorar?urgencia=1'
		});
	}
	return actions;
}

function inviteToRegisterIfGuest({ user }) {
	if (user?.id) return null;
	return 'Si te registras, luego te será más fácil agendar. Puedo seguir igual como visita.';
}

function hasCompleteTriage(triage) {
	if (!triage) return false;
	if (!triage.species) return false;
	if (triage.ageYears == null && triage.ageMonths == null) return false;
	if (!triage.mainSymptom) return false;
	if (!triage.since) return false;
	if (!triage.demeanor) return false;
	return true;
}

function buildFallbackNoAi(triage, user, opts = {}) {
	const { failureKind, devError } = opts;
	const inv = inviteToRegisterIfGuest({ user });

	if (hasCompleteTriage(triage)) {
		return [buildWarmOfflineReply(triage), inv].filter(Boolean).join('\n\n');
	}

	const ack = buildPetAcknowledgment(triage);

	let tech;
	switch (failureKind) {
		case 'quota':
			tech = 'El asistente alcanzó el límite de uso o saldo configurado. Avisa a quien administra la plataforma.';
			break;
		case 'auth':
			tech = 'El asistente rechazó las credenciales del servidor. Es un problema de configuración del backend.';
			break;
		case 'rate_limit':
			tech = 'El asistente tuvo un límite de peticiones por un momento. Espera un poco y escríbeme de nuevo.';
			break;
		case 'no_key':
			tech = 'El asistente de IA no está configurado en este servidor. Avisa a quien lo administra.';
			break;
		case 'parse':
			tech = 'Recibí una respuesta extraña del asistente y no pude interpretarla. Prueba a enviar otra frase o reintenta en un minuto.';
			break;
		case 'empty':
			tech = 'El asistente devolvió una respuesta vacía. Reintenta el mensaje en un momento.';
			break;
		case 'model':
			tech = 'Hubo un error con el modelo configurado en el servidor. Avisa a quien administra la plataforma.';
			break;
		case 'timeout':
			tech = 'La conexión con el asistente tardó demasiado. Prueba de nuevo en un minuto.';
			break;
		case 'network':
			tech = 'Hubo un problema de red en el servidor. No es nada de tu parte. Reintenta en un rato.';
			break;
		default:
			tech = 'Ahora no pude conectar con el asistente. Reintenta en un momento.';
	}

	const follow =
		'Cuando vuelva el asistente, seguimos con calma: qué pasa, desde hace cuánto, y cómo lo notas. Si ahora notas algo fuerte o mucha debilidad, hoy a clínica; si se mantiene razonable, reintenta el mensaje.';

	const devFoot =
		process.env.NODE_ENV === 'development' && devError
			? `[dev] ${String(devError).slice(0, 300)}`
			: null;

	return [ack, tech, follow, inv, devFoot].filter(Boolean).join('\n\n');
}

async function postChat(req, res, next) {
	try {
		const { message, sessionId: incomingSessionId, reset: resetSession, history: incomingHistory } = req.body || {};

		/** @returns {{ role: 'user'|'assistant', content: string }[]} */
		function normalizeIncomingHistory(raw) {
			if (!Array.isArray(raw)) return [];
			return raw
				.slice(-40)
				.map((m) => ({
					role: m && m.role === 'user' ? 'user' : 'assistant',
					content: String(m && m.content != null ? m.content : '').slice(0, 1200)
				}))
				.filter((m) => m.content.trim() !== '');
		}

		const clientHistory = normalizeIncomingHistory(incomingHistory);

		if (resetSession === true) {
			// Sin persistencia: solo reinicia el saludo (el cliente limpia su historial).
			// Mantener compatibilidad con sessionId si existía.
			if (incomingSessionId) chatStore.destroySession(incomingSessionId);
			const { sessionId, session } = chatStore.getOrCreate(null, { userId: req.user?.id });
			ensureTriage(session);
			const intro = [
				'Hola, soy Vetto, estoy aquí para acompañarte mientras cuidas a tu compañero.',
				'Puedes contarme con calma lo que te pasa, sin buscar un guion: como te salga, aunque sea a medias.',
				'Cuando quieras, dime qué mascota es, qué notas y, si hace sentido, desde hace cuánto.',
				inviteToRegisterIfGuest({ user: req.user }) || ''
			]
				.filter(Boolean)
				.join('\n\n');
			// No guardamos historial como “feature”; el contexto lo trae el cliente.
			return res.status(200).json({
				sessionId: null,
				message: intro,
				urgencyLevel: 'verde',
				actions: buildActions({ urgencyLevel: 'verde' }),
				disclaimer: DISCLAIMER
			});
		}

		const userMessage = String(message || '').trim();
		if (!userMessage) {
			return res.status(400).json({
				message: 'Escribe un mensaje con los síntomas o comportamiento que observas.',
				urgencyLevel: 'verde',
				actions: buildActions({ urgencyLevel: 'verde' }),
				disclaimer: DISCLAIMER
			});
		}

		// Contexto: el cliente envía el historial completo de la conversación activa en cada request.
		const triage = {};
		for (const h of clientHistory) {
			if (h.role === 'user') {
				maybeExtractFromMessage(triage, h.content);
			}
		}
		maybeExtractFromMessage(triage, userMessage);

		const pre = detectUrgencyLevel(userMessage);
		const historyMessages = clientHistory.slice(-12);

		let assistantText = null;
		let responseUrgency = pre.urgencyLevel;
		const invite = inviteToRegisterIfGuest({ user: req.user });

		if (pre.urgencyLevel === 'rojo') {
			assistantText = [
				'Te entiendo, debe ser duro. Por lo que cuentas, lo prudente es no esperar: acudid ya a urgencia o clínica que atienda ahora.',
				'Si podéis, llevad anotado: edad aproximada, cuándo empezó, y si hubo mordedura, caída, tóxicos o atropello. Te ayudará a la recepción.',
				DISCLAIMER
			].join('\n\n');
			responseUrgency = 'rojo';
		} else {
			const triageContext = buildTriageContextForModel(triage);
			const messages = buildMessages({ historyMessages, userMessage, triageContext });
			const timeoutMs = Number(process.env.CHAT_LLM_TIMEOUT_MS || 8000);
			const ai = await callChatLlm({ messages, timeoutMs });

			if (ai.ok) {
				if (ai.parsed) {
					assistantText = ai.parsed.reply;
					responseUrgency = mergeUrgencyLevels(pre.urgencyLevel, ai.parsed.urgencyLevel);
				} else {
					responseUrgency = mergeUrgencyLevels(pre.urgencyLevel, 'amarillo');
					assistantText = hasCompleteTriage(triage)
						? [buildWarmOfflineReply(triage), invite].filter(Boolean).join('\n\n')
						: buildFallbackNoAi(triage, req.user, { failureKind: 'parse' });
				}
				if (!assistantText) {
					assistantText = hasCompleteTriage(triage)
						? [buildWarmOfflineReply(triage), invite].filter(Boolean).join('\n\n')
						: buildFallbackNoAi(triage, req.user, { failureKind: 'unknown' });
					responseUrgency = pre.urgencyLevel;
				}
			} else {
				assistantText = hasCompleteTriage(triage)
					? [buildWarmOfflineReply(triage), invite].filter(Boolean).join('\n\n')
					: buildFallbackNoAi(triage, req.user, {
							failureKind: ai.failureKind,
							devError: ai.error
					  });
				responseUrgency = pre.urgencyLevel;
			}
		}

		if (!assistantText || !String(assistantText).trim()) {
			assistantText =
				'Perdona, se me cruzó el mensaje. Escribe otra vez con calma lo que te pasa y vamos poquito a poco. Te escucho.';
		}

		return res.status(200).json({
			sessionId: null,
			message: assistantText,
			urgencyLevel: responseUrgency,
			actions: buildActions({ urgencyLevel: responseUrgency }),
			disclaimer: DISCLAIMER
		});
	} catch (err) {
		return next(err);
	}
}

module.exports = {
	postChat
};
