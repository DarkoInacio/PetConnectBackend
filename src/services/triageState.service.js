'use strict';

function normalizeText(input) {
	return String(input || '')
		.toLowerCase()
		.replace(/ñ/g, 'n')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function ensureTriage(session) {
	if (!session.triage) {
		session.triage = {
			species: null, // gato | perro | otra
			ageYears: null,
			ageMonths: null, // cachorros: "3 meses"
			since: null, // texto corto: "desde la mañana", "desde ayer"
			mainSymptom: null, // vomito | diarrea | respiracion | dolor | ocular | herida
			demeanor: null, // normal | bajo
			askedKeys: [] // evita repetir preguntas
		};
	}
	return session.triage;
}

function maybeExtractFromMessage(triage, userMessage) {
	const t = normalizeText(userMessage);
	if (!t) return triage;

	if (!triage.species) {
		if (/\bgat(o|a|ito|ita|itos|itas)\b/.test(t)) triage.species = 'gato';
		else if (/\bperr(o|a|ito|ita|itos|itas)\b/.test(t)) triage.species = 'perro';
	}

	if (triage.ageYears == null && triage.ageMonths == null) {
		const mMeses = t.match(/(\d{1,2})\s*(mes|meses)\b/);
		if (mMeses) {
			const n = Number(mMeses[1]);
			if (Number.isFinite(n) && n > 0 && n <= 24) triage.ageMonths = n;
		}
		const mAnos = t.match(/(\d{1,2})\s*(anos|año|años|anio|anios)\b/);
		if (mAnos && triage.ageMonths == null) {
			const n = Number(mAnos[1]);
			if (Number.isFinite(n) && n > 0 && n < 40) triage.ageYears = n;
		}
	}

	if (!triage.since) {
		// "desde la mañana", "desde ayer", o solo "ayer" / "hoy"
		const desde = t.match(
			/\bdesde\s+(hoy|ayer|la\s+manana|la\s+tarde|la\s+noche|esta\s+manana|esta\s+tarde|esta\s+noche|anoche|el\s+mediodia)\b/
		);
		if (desde) triage.since = desde[0];
		else if (/\bayer\b/.test(t) && t.length < 50) triage.since = 'ayer';
		// "hoy día", "hoy me di cuenta", hoy aislado
		else if (/\bhoy(\s+(dia|día|mismo|a\s+la\s+manana|a\s+la\s+mañana))?\b/.test(t) || t.includes('hoy me di') || t.includes('hoy dia')) {
			triage.since = 'hoy (reciente)';
		} else if (t === 'hoy' || (/\bhoy\b/.test(t) && t.length < 30)) {
			triage.since = 'hoy';
		}
	}

	if (!triage.mainSymptom) {
		// Herida / traumatismo antes de reglas demasiado genéricas
		if (
			/(herid|cort[ea]|cortad|rasgu[ñn]|raspa|golpe|golp|mordi|morded|piqu|moret|lacer|punz|sangr(a|e|o|d)|hemato|himo)\w*/.test(t) ||
			/cuello|pata|oreja|boca|hoci/.test(t)
		) {
			// Sólo fijar 'herida' si el mensaje alude a lesión, no a “el cuello” aislado
			if (/(herid|sangr|cort|raspu|golpe|mordi|lacer|punz)/.test(t) || (/\b(cuello|pata|oreja)\b/.test(t) && /(herid|golpe|golp|mordi|mord|sangr|rasg)/.test(t))) {
				triage.mainSymptom = 'herida';
			}
		}
	}

	if (!triage.mainSymptom) {
		if (t.includes('vomit') || /vomita|vomito|vomitos|vomitan|vomitar|vomitando|vomité/.test(t)) {
			triage.mainSymptom = 'vomito';
		} else if (t.includes('diarre') || t.includes('caca') || /\bheces\s+blanda/.test(t)) {
			triage.mainSymptom = 'diarrea';
		} else if (/(no\s+respira|dificultad\s+para\s+respirar|respira\s+rapido|jadea)/.test(t)) {
			triage.mainSymptom = 'respiracion';
		} else if (
			/ojo|ojos|ocular|parpado|pupil|laga[ñn]a|lagr|vision|mira|raro\s+en\s+el\s+ojo/.test(t) ||
			/\bojo\b/.test(t)
		) {
			triage.mainSymptom = 'ocular';
		} else if (/\bdolor\b|\bse\s+queja\b|\bcojea?\b/.test(t)) {
			triage.mainSymptom = 'dolor';
		}
	}

	// Animo: respuestas cortas del usuario
	if (!triage.demeanor) {
		if (/\bnormal\b|como\s+siempre|bien\b|tranquil|igual\s+que\s+siempre/.test(t) && t.length < 50) {
			triage.demeanor = 'normal';
		}
		if (/\bdecaid|apatic|triste|muy\s+mal|abati|deprim/.test(t)) {
			triage.demeanor = 'bajo';
		}
	}

	return triage;
}

/** Frase cálida según lo que ya extrajimos (no exige triage completo). */
function buildPetAcknowledgment(triage) {
	if (!triage) return null;
	if (triage.species === 'gato') {
		return 'Qué lindo, gracias por contarme de tu gatito — ya lo tengo presente.';
	}
	if (triage.species === 'perro') {
		return 'Qué lindo, gracias por contarme de tu perrito — ya lo tengo presente.';
	}
	if (triage.species === 'otra') {
		return 'Gracias por contarme de tu compañero; ya lo tengo presente.';
	}
	return null;
}

function pickNextQuestion(triage) {
	// Orden: especie -> edad -> síntoma -> desde cuándo -> ánimo (una pregunta por turno)
	const asked = new Set(triage.askedKeys || []);

	if (!triage.species && !asked.has('species')) {
		return {
			key: 'species',
			question: '¿Me cuentas si es perro, gato u otra mascota?'
		};
	}
	if (triage.ageYears == null && triage.ageMonths == null && !asked.has('ageYears')) {
		return { key: 'ageYears', question: '¿Cuántos años o meses tiene? (basta aproximado, ej. “3 meses”).' };
	}
	if (!triage.mainSymptom && !asked.has('mainSymptom')) {
		return {
			key: 'mainSymptom',
			question:
				'¿Qué pasa: piel, oídos, ojos, vientre, respirar, cojera…? Una frase rara sirve, no pasa nada.'
		};
	}
	if (!triage.since && !asked.has('since')) {
		return {
			key: 'since',
			question: '¿Desde cuándo notas esto? Si puedes, di también cuántas veces ha pasado hoy o ayer.'
		};
	}
	if (!triage.demeanor && !asked.has('demeanor')) {
		return {
			key: 'demeanor',
			question: 'Por último: ¿cómo lo ves de ánimo — más o menos como siempre, o apagado / sin ganas?'
		};
	}

	return null;
}

function markAsked(triage, key) {
	if (!key) return;
	if (!triage.askedKeys) triage.askedKeys = [];
	if (!triage.askedKeys.includes(key)) triage.askedKeys.push(key);
}

/** Resumen que se inyecta al modelo para no repetir lo ya contado. */
function buildTriageContextForModel(triage) {
	const parts = [];
	if (triage.species) parts.push(`Especie: ${triage.species}`);
	if (triage.ageMonths) parts.push(`Edad: ${triage.ageMonths} meses`);
	else if (triage.ageYears) parts.push(`Edad aproximada: ${triage.ageYears} años`);
	if (triage.mainSymptom) parts.push(`Lo que más preocupa: ${triage.mainSymptom}`);
	if (triage.since) parts.push(`Desde / evolución: ${triage.since}`);
	if (triage.demeanor) {
		parts.push(`Ánimo: ${triage.demeanor === 'normal' ? 'casi como siempre' : 'bajo o preocupante'}`);
	}
	if (parts.length === 0) {
		return 'Aún comparte poco: acójele con ternura, no interrogar; pide con calma solo lo imprescindible, en el flujo de la charla.';
	}
	return `Contexto que el dueño ya contó (no repitas al pedir detalles):\n${parts.map((p) => `- ${p}`).join('\n')}`;
}

/**
 * Si OpenAI no responde y ya tenemos triage mínimo, guía cálida (no diagnóstico).
 */
function buildWarmOfflineReply(triage) {
	if (triage.mainSymptom === 'vomito') {
		return [
			'Te acompaño, es angustioso con los vómitos. Desde lejos, lo que más orienta no es ponerle nombre a la enfermedad, sino ver si mantiene agua, y si vuelve a vomitar otra y otra sin tregua, o baja de ánimo. Si se apata mucho, vómita con sangre, el vientre hincha, o boca apestosa muy rara, hoy a clínica o urgencia; cachorros, encima, no toleran tanta deshidratación.',
			'Cuando tengan conexión, un veterinario afinaría en persona; tú hiciste lo correcto al escribirlo.'
		].join(' ');
	}
	if (triage.mainSymptom === 'diarrea') {
		return [
			'Entiendo la preocupación; un vientre raro agota. Lo que suele inquietar es agua, ganas de beber, y si hay sangre. Si se ve muy triste, no retiene líquido, o mezcla sangre con dolor, hoy a revisión. Lo demás, un ojo a que no empeore y apoyo, sin inventar la causa: eso le toca a quien le palpe.',
			'Cariños y ánimo de mi parte; cuando el chat vuelva, estamos si quieres afinar.'
		].join(' ');
	}
	if (triage.mainSymptom === 'ocular') {
		return [
			'Uf, el ojito, sé lo que pesa. Sin mirarlo con luz y calma, lo sano no es asegurar, pero tampoco es dejar días; un ojo enrojecido o apretado a veces acelera en horas. Cita o urgencia según lo dolorido que luzca, y mientras, que no se lo frote — y nada de gotas caseras. Abrazo de lejos, estás cuidando bien al avisar.'
		].join(' ');
	}
	return [
		'Gracias por confiarme lo que pasa; no puedo afinar como clínica desde aquí, pero tú haces bien al vigilar. Si hoy baja de ánimo, no mantiene agua, o lo notas claramente peor, busca cita o urgencia; un veterinario, con la mascota a la vista, acomoda dudas que yo a distancia no cierro. Cuando vuelva el asistente, te seguimos escuchando.'
	].join(' ');
}

/**
 * Sin LLM: respuesta cálida basada en reglas y lo ya extraído (no hace falta “machine learning”).
 * @param {object} opts
 * @param {boolean} opts.triageComplete - resultado de hasCompleteTriage
 * @param {string|null} opts.invite
 * @param {string} opts.disclaimer
 */
function buildHeuristicRulesOnlyReply(triage, { triageComplete, invite, disclaimer } = {}) {
	if (triageComplete) {
		return [buildWarmOfflineReply(triage), invite].filter(Boolean).join('\n\n');
	}
	const ack = buildPetAcknowledgment(triage) || 'Gracias por escribir, te leo con calma.';
	const body =
		'Ahora respondo con reglas cuidadosas, sin nube. Entrenar un modelo “propio” en serio pide mucho dato, equipo y experiencia; lo habitual es usar un modelo ya hecho (p. ej. con Ollama en tu PC) o seguir con esta guía. A tu ritmo: contame qué pasa, desde hace cuánto, y si comen y toman agua; si baja de ánimo o empeora, hoy a clínica.';
	return [ack, body, disclaimer, invite].filter(Boolean).join('\n\n');
}

module.exports = {
	ensureTriage,
	maybeExtractFromMessage,
	buildPetAcknowledgment,
	pickNextQuestion,
	markAsked,
	buildTriageContextForModel,
	buildWarmOfflineReply,
	buildHeuristicRulesOnlyReply
};

