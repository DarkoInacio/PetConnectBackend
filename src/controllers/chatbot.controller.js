'use strict';

const crypto = require('crypto');
const { getConversation, pushMessage } = require('../services/chatbotMemory');

function getEnv(name, fallback) {
	const v = process.env[name];
	if (v === undefined || v === null || String(v).trim() === '') return fallback;
	return String(v);
}

function isPlaceholderKey(apiKey) {
	const k = String(apiKey || '').trim();
	if (!k) return true;
	return k === 'TU_API_KEY_AQUI' || k === 'YOUR_OPENAI_API_KEY' || k === 'your_openai_api_key';
}

function jsonSafeParse(s) {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

function buildSystemPrompt({ user }) {
	return [
		'Eres un asistente de orientación básica de salud animal (perros/gatos) para dueños de mascotas.',
		'Responde SIEMPRE en español claro y calmado.',
		'No diagnostiques ni prescribas. Da orientación general y triage.',
		'Si hay señales de urgencia, indícalo explícitamente y sugiere acudir a veterinaria de urgencia.',
		'Siempre incluye el disclaimer exacto al final: "Esta orientación es informativa. Consulta a un veterinario."',
		'Adapta la respuesta al contexto si el usuario está logueado o no.',
		user ? `El usuario está logueado (nombre: ${user.name || 'Usuario'}).` : 'El usuario NO está logueado; puedes invitar a registrarse para guardar historial y agendar.',
		'Devuelve SOLO JSON válido con esta forma:',
		'{',
		'  "respuesta": string,',
		'  "urgente": boolean,',
		'  "motivos_urgencia": string[],',
		'  "preguntas_seguimiento": string[],',
		'  "recordatorio_registro": string | null',
		'}',
		'En "respuesta" incluye al final 3 opciones en una línea separadas por " | ": "Buscar veterinarias | Agendar cita | Seguir consultando".'
	].join('\n');
}

function looksUrgentFallback(text) {
	const t = String(text || '').toLowerCase();
	return (
		t.includes('urgencia') ||
		t.includes('urgente') ||
		t.includes('inmediato') ||
		t.includes('dificultad para respirar') ||
		t.includes('no puede respirar') ||
		t.includes('convuls') ||
		t.includes('sangrado abundante') ||
		t.includes('colaps') ||
		t.includes('inconsciente') ||
		t.includes('abdomen hinchado')
	);
}

function isShortGreeting(text) {
	const t = String(text || '')
		.toLowerCase()
		.trim()
		.replace(/[!.?,;:]/g, '');
	const greetings = new Set(['hola', 'buenas', 'buenos dias', 'buen día', 'buenas tardes', 'buenas noches', 'hello']);
	return t.length <= 20 && greetings.has(t);
}

async function callOpenAIChat({ messages, timeoutMs }) {
	const apiKey = getEnv('OPENAI_API_KEY', null);
	if (!apiKey) {
		const err = new Error('Falta OPENAI_API_KEY en el servidor.');
		err.status = 500;
		throw err;
	}

	const model = getEnv('OPENAI_MODEL', 'gpt-4o-mini');
	const url = 'https://api.openai.com/v1/chat/completions';

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const resp = await fetch(url, {
			method: 'POST',
			signal: controller.signal,
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model,
				messages,
				temperature: 0.3,
				max_tokens: 500
			})
		});

		if (!resp.ok) {
			const raw = await resp.text().catch(() => '');
			const err = new Error(`Error del proveedor de IA (${resp.status}).`);
			err.status = 502;
			err.details = raw;
			throw err;
		}

		const data = await resp.json();
		const content = data?.choices?.[0]?.message?.content;
		if (!content) {
			const err = new Error('Respuesta vacía del proveedor de IA.');
			err.status = 502;
			throw err;
		}
		return content;
	} catch (e) {
		if (e?.name === 'AbortError') {
			const err = new Error('Tiempo de espera agotado al consultar la IA.');
			err.status = 504;
			throw err;
		}
		throw e;
	} finally {
		clearTimeout(timer);
	}
}

function buildOfflineReply({ userText, user, recentUserMessages = [] }) {
	const text = String(userText || '').trim();
	const shortGreeting = isShortGreeting(text);

	const registerCta = user
		? null
		: 'Si quieres, regístrate para guardar tus consultas y agendar más rápido.';

	if (shortGreeting) {
		return {
			respuesta: [
				'Hola. Cuéntame qué notas en tu mascota (síntomas, desde cuándo, cuántas veces, edad aproximada y estado general) y te doy una orientación básica.',
				'',
				'Buscar veterinarias | Agendar cita | Seguir consultando',
				'',
				'Esta orientación es informativa. Consulta a un veterinario.'
			].join('\n'),
			urgente: false,
			motivos_urgencia: [],
			preguntas_seguimiento: [],
			recordatorio_registro: registerCta
		};
	}

	const mergedUserContext = [...recentUserMessages, text].join(' \n ');
	const triageInput = inferTriageInputFromText(mergedUserContext);
	const classification = classifyUrgency(triageInput);
	const triage = buildTriageOutput(classification);
	// Si el caso cae en AMARILLO por datos incompletos, suavizamos el texto
	// para reflejar incertidumbre y pedir completar información.
	if (
		classification.nivelUrgencia === 'AMARILLO' &&
		/informaci[oó]n incompleta|no concluyente/i.test(String(classification.motivo || ''))
	) {
		triage.mensaje =
			'Con lo indicado aún faltan datos para clasificar con mayor precisión. Se recomienda completar síntomas clave y mantener observación cercana.';
		triage.cta = 'Seguir consultando';
	}
	const urgent = triage.nivelUrgencia === 'ROJO';
	const signals = inferStructuredSignalsFromText(mergedUserContext);
	const followUps = [];
	if (signals.vomitosVeces === null) followUps.push('¿Ha vomitado? Si sí, ¿cuántas veces?');
	if (signals.hidratacion === null && signals.apetito === null) followUps.push('¿Está comiendo y bebiendo agua?');
	else if (signals.hidratacion === null) followUps.push('¿Está bebiendo agua con normalidad?');
	else if (signals.apetito === null) followUps.push('¿Está comiendo con normalidad?');
	if (signals.dolor === null) followUps.push('¿Notas dolor o empeoramiento?');
	if (signals.respiracion === null) followUps.push('¿Respira con normalidad o la ves más decaída ahora?');
	if (followUps.length === 0) followUps.push('¿Quieres contarme si hubo algún cambio desde tu último mensaje?');
	const actionsLine = 'Buscar veterinarias | Agendar cita | Seguir consultando';

	const reply = [
		`Nivel de urgencia orientativo: ${triage.nivelUrgencia}.`,
		triage.mensaje,
		'',
		'Recomendaciones:',
		...triage.recomendaciones.map((r) => `- ${r}`),
		'',
		'Para afinar la orientación, responde (si puedes):',
		...followUps.map((q) => `- ${q}`),
		'',
		`CTA recomendado: ${triage.cta}.`,
		actionsLine,
		'',
		'Esta orientación es informativa. Consulta a un veterinario.'
	].join('\n');

	return {
		respuesta: reply,
		urgente: urgent,
		motivos_urgencia: [classification.motivo],
		preguntas_seguimiento: followUps,
		recordatorio_registro: registerCta
	};
}

/**
 * Normaliza y valida input básico para triage estructurado.
 * No usa DB; solo transforma valores para aplicar reglas en memoria.
 */
function normalizeTriageInput(body) {
	if (!body || typeof body !== 'object') {
		const err = new Error('El body debe ser un objeto JSON.');
		err.status = 400;
		throw err;
	}

	const estadoRaw = String(body.estado || '').trim().toLowerCase();
	const estado = estadoRaw || 'desconocido';
	const allowedEstados = new Set(['activo', 'decaido', 'no_activo', 'muy_debil', 'desconocido']);
	if (!allowedEstados.has(estado)) {
		const err = new Error('El campo "estado" debe ser: activo, decaido, no_activo o muy_debil.');
		err.status = 400;
		throw err;
	}

	const vomitoConSangre = Boolean(body.vomitoConSangre);
	const vomitosVeces = Number.isFinite(Number(body.vomitosVeces)) ? Number(body.vomitosVeces) : 0;
	const duracionDias = Number.isFinite(Number(body.duracionDias)) ? Number(body.duracionDias) : 0;
	const edadMeses = Number.isFinite(Number(body.edadMeses)) ? Number(body.edadMeses) : 0;

	if (vomitosVeces < 0 || duracionDias < 0 || edadMeses < 0) {
		const err = new Error('vomitosVeces, duracionDias y edadMeses no pueden ser negativos.');
		err.status = 400;
		throw err;
	}

	const otrosSintomas = Array.isArray(body.otrosSintomas)
		? body.otrosSintomas.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
		: [];

	return {
		vomitoConSangre,
		estado,
		vomitosVeces,
		duracionDias,
		edadMeses,
		otrosSintomas
	};
}

function classifyUrgency(input) {
	const hasOtrosSintomasRelevantes = input.otrosSintomas.some((s) =>
		['diarrea', 'no comer', 'no_comer', 'dolor', 'fiebre'].includes(s)
	);
	const vomitosVariasVeces = input.vomitosVeces >= 2;
	const vomitosFrecuentes = input.vomitosVeces >= 3;
	const menorAUnAno = input.edadMeses > 0 && input.edadMeses < 12;

	// REGLAS ROJAS (prioridad máxima)
	if (input.vomitoConSangre) {
		return {
			nivelUrgencia: 'ROJO',
			motivo: 'Se reporta vómito con sangre.'
		};
	}
	if (input.estado === 'muy_debil') {
		return {
			nivelUrgencia: 'ROJO',
			motivo: 'Se reporta estado muy débil.'
		};
	}
	if (vomitosVariasVeces && input.estado === 'no_activo') {
		return {
			nivelUrgencia: 'ROJO',
			motivo: 'Vómitos repetidos con estado no activo.'
		};
	}
	if (input.duracionDias > 1) {
		return {
			nivelUrgencia: 'ROJO',
			motivo: 'Vómitos por más de 1 día.'
		};
	}
	if (menorAUnAno && vomitosFrecuentes) {
		return {
			nivelUrgencia: 'ROJO',
			motivo: 'Mascota menor de 1 año con vómitos frecuentes.'
		};
	}

	// REGLAS AMARILLAS
	if (vomitosVariasVeces || input.estado === 'decaido' || hasOtrosSintomasRelevantes) {
		return {
			nivelUrgencia: 'AMARILLO',
			motivo: 'Signos moderados que requieren seguimiento cercano.'
		};
	}

	// REGLA VERDE
	if (input.vomitosVeces === 1 && input.estado === 'activo' && !hasOtrosSintomasRelevantes) {
		return {
			nivelUrgencia: 'VERDE',
			motivo: 'Evento aislado con mascota activa y sin otros síntomas.'
		};
	}

	// Caso no concluyente: conservador
	return {
		nivelUrgencia: 'AMARILLO',
		motivo: 'Información incompleta o patrón no concluyente; se recomienda vigilancia.'
	};
}

function buildTriageOutput(classification) {
	if (classification.nivelUrgencia === 'ROJO') {
		return {
			nivelUrgencia: 'ROJO',
			mensaje:
				'Los signos reportados podrían indicar una situación urgente. Se recomienda acudir a una veterinaria de urgencia lo antes posible.',
			recomendaciones: [
				'Mantén a tu mascota en un lugar tranquilo y vigilada.',
				'No ofrezcas medicamentos por cuenta propia.',
				'Si hay empeoramiento, traslado inmediato a urgencias veterinarias.',
				'Lleva información de tiempo de evolución y síntomas observados.'
			],
			cta: 'Acudir a urgencias veterinarias'
		};
	}

	if (classification.nivelUrgencia === 'AMARILLO') {
		return {
			nivelUrgencia: 'AMARILLO',
			mensaje:
				'El cuadro podría requerir evaluación veterinaria en el corto plazo. Se recomienda seguimiento cercano y consulta si no mejora.',
			recomendaciones: [
				'Observa hidratación, apetito y energía durante las próximas horas.',
				'Registra número de vómitos y cualquier síntoma adicional.',
				'No automediques.',
				'Si aparecen señales de alarma, acude a urgencias.'
			],
			cta: 'Agendar cita veterinaria'
		};
	}

	return {
		nivelUrgencia: 'VERDE',
		mensaje:
			'Por ahora el cuadro podría ser leve, pero se recomienda vigilancia en casa y consultar si reaparece o empeora.',
		recomendaciones: [
			'Monitorea evolución durante 24 horas.',
			'Mantén agua disponible y observa tolerancia.',
			'Si hay nuevos síntomas o más vómitos, consulta veterinaria.'
		],
		cta: 'Seguir monitoreando'
	};
}

function inferTriageInputFromText(userText) {
	const t = String(userText || '').toLowerCase();

	const vomitoConSangre = /v[oó]mit(o|ó).*(sangre)|sangre.*v[oó]mit(o|ó)/i.test(t);
	const vomitosVeces = /varias veces|muchas veces|frecuente|frecuentes/.test(t)
		? 3
		: /dos veces|2 veces/.test(t)
			? 2
			: /una vez|1 vez|vomit[oó]/.test(t)
				? 1
				: 0;

	const duracionDias = /m[aá]s de 1 d[ií]a|dos d[ií]as|2 d[ií]as|varios d[ií]as/.test(t) ? 2 : 0;
	const edadMeses = /menor|cachorro|gatito|menos de 1 a[nñ]o/.test(t)
		? 6
		: /1 a[nñ]o|un a[nñ]o/.test(t)
			? 12
			: 24;

	let estado = 'desconocido';
	if (/muy debil|muy d[eé]bil/.test(t)) estado = 'muy_debil';
	else if (/no activo|sin energ[ií]a total|postrad[oa]/.test(t)) estado = 'no_activo';
	else if (/decaid[oa]|apagad[oa]|cansad[oa]/.test(t)) estado = 'decaido';
	else if (/activo|juega normal|normal/.test(t)) estado = 'activo';

	const otrosSintomas = [];
	if (/diarrea/.test(t)) otrosSintomas.push('diarrea');
	if (/no come|sin comer|no quiere comer/.test(t)) otrosSintomas.push('no_comer');
	if (/dolor|se queja/.test(t)) otrosSintomas.push('dolor');
	if (/fiebre/.test(t)) otrosSintomas.push('fiebre');

	return {
		vomitoConSangre,
		estado,
		vomitosVeces,
		duracionDias,
		edadMeses,
		otrosSintomas
	};
}

function inferStructuredSignalsFromText(userText) {
	const t = String(userText || '').toLowerCase();

	let vomitosVeces = null;
	if (/no ha vomitado|no vomita|sin vomit|no vomit[oó]/.test(t)) vomitosVeces = 0;
	else if (/varias veces|muchas veces|frecuente|frecuentes/.test(t)) vomitosVeces = 3;
	else if (/dos veces|2 veces/.test(t)) vomitosVeces = 2;
	else if (/una vez|1 vez|vomit[oó]/.test(t)) vomitosVeces = 1;

	let respiracion = null;
	if (/respira con normalidad|respira normal|sin dificultad para respirar/.test(t)) respiracion = 'normal';
	else if (/no respira bien|dificultad para respirar|respira mal/.test(t)) respiracion = 'dificultad';

	let hidratacion = null;
	if (/toma agua|bebe agua/.test(t)) hidratacion = 'ok';
	else if (/no toma agua|no bebe|no quiere beber/.test(t)) hidratacion = 'baja';

	let apetito = null;
	if (/si come|sí come|come normal|come bien/.test(t)) apetito = 'ok';
	else if (/come poquito|come poco|poco apetito|apetito bajo/.test(t)) apetito = 'bajo';
	else if (/no come|sin comer|no quiere comer/.test(t)) apetito = 'muy_bajo';

	let dolor = null;
	if (/sin dolor|sin dolores|no dolor/.test(t)) dolor = false;
	else if (/dolor|se queja/.test(t)) dolor = true;

	return { vomitosVeces, respiracion, hidratacion, apetito, dolor };
}

async function postChatbotTriage(req, res, next) {
	try {
		const input = normalizeTriageInput(req.body);
		const classification = classifyUrgency(input);
		const output = buildTriageOutput(classification);

		return res.status(200).json({
			...output,
			motivoClasificacion: classification.motivo,
			disclaimer: 'Esta orientación es informativa. Consulta a un veterinario.'
		});
	} catch (error) {
		next(error);
	}
}

async function postChatbotMessage(req, res, next) {
	try {
		const userText = String(req.body?.message || '').trim();
		if (!userText) return res.status(400).json({ message: 'El mensaje es requerido' });

		let conversationId = String(req.body?.conversationId || '').trim();
		if (!conversationId) conversationId = crypto.randomUUID();

		const existing = getConversation(conversationId);
		const prior = existing?.messages || [];
		const priorUserMessages = prior
			.filter((m) => m && m.role === 'user' && m.content)
			.map((m) => String(m.content))
			.slice(-5);

		const system = buildSystemPrompt({ user: req.user || null });
		const modelMessages = [
			{ role: 'system', content: system },
			...prior.map((m) => ({ role: m.role, content: m.content })),
			{ role: 'user', content: userText }
		];

		// Guardamos el mensaje del usuario antes de llamar (para mantener contexto aún si hay retry del cliente)
		pushMessage(conversationId, { role: 'user', content: userText });

		let responseObj;
		const apiKey = getEnv('OPENAI_API_KEY', null);
		if (!apiKey || isPlaceholderKey(apiKey)) {
			// Modo offline (sin proveedor de IA): triage por reglas para no bloquear el chatbot.
			responseObj = buildOfflineReply({ userText, user: req.user || null, recentUserMessages: priorUserMessages });
		} else {
			// Objetivo: respuesta < 5s end-to-end. Dejamos margen para red/serialización.
			try {
				const raw = await callOpenAIChat({ messages: modelMessages, timeoutMs: 4200 });
				const parsed = jsonSafeParse(raw);
				responseObj =
					parsed && typeof parsed === 'object'
						? parsed
						: {
								respuesta:
									String(raw).trim() +
									'\n\nBuscar veterinarias | Agendar cita | Seguir consultando\n\n' +
									'Esta orientación es informativa. Consulta a un veterinario.',
								urgente: looksUrgentFallback(raw),
								motivos_urgencia: [],
								preguntas_seguimiento: [],
								recordatorio_registro: req.user
									? null
									: 'Si quieres, regístrate para guardar tus consultas y agendar más rápido.'
							};
			} catch (err) {
				// Si hay credenciales inválidas o proveedor inaccesible, degradamos a modo offline
				// para no romper el flujo del chatbot.
				const details = String(err?.details || '');
				const isAuthError = err?.status === 401 || err?.status === 403 || /"type":"invalid_request_error"/i.test(details);
				if (isAuthError) {
					responseObj = buildOfflineReply({ userText, user: req.user || null, recentUserMessages: priorUserMessages });
				} else {
					throw err;
				}
			}
		}

		// Asegurar disclaimer exacto
		if (!String(responseObj.respuesta || '').includes('Esta orientación es informativa. Consulta a un veterinario.')) {
			responseObj.respuesta = `${String(responseObj.respuesta || '').trim()}\n\nEsta orientación es informativa. Consulta a un veterinario.`;
		}

		// Asegurar opciones finales
		if (!/Buscar veterinarias\s*\|\s*Agendar cita\s*\|\s*Seguir consultando/i.test(String(responseObj.respuesta || ''))) {
			responseObj.respuesta = `${String(responseObj.respuesta || '').trim()}\n\nBuscar veterinarias | Agendar cita | Seguir consultando`;
		}

		pushMessage(conversationId, { role: 'assistant', content: String(responseObj.respuesta || '').trim() });

		return res.status(200).json({
			conversationId,
			reply: String(responseObj.respuesta || '').trim(),
			urgent: Boolean(responseObj.urgente),
			urgentReasons: Array.isArray(responseObj.motivos_urgencia) ? responseObj.motivos_urgencia : [],
			followUps: Array.isArray(responseObj.preguntas_seguimiento) ? responseObj.preguntas_seguimiento : [],
			registerCta: responseObj.recordatorio_registro ? String(responseObj.recordatorio_registro) : null
		});
	} catch (error) {
		next(error);
	}
}

module.exports = { postChatbotMessage, postChatbotTriage };

