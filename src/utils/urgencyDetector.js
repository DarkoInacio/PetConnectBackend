'use strict';

const CRITICAL_KEYWORDS = [
	// Se mantiene por compatibilidad/telemetría (triggers), pero la detección real usa patrones.
	'convulsiona',
	'no respira',
	'sangrado abundante',
	'atropello',
	'no puede orinar',
	'inconsciente',
	'intoxicacion'
];

const CRITICAL_PATTERNS = [
	/\bconvulsion(a|es|ando|o)?\b/,
	/(no\s+(puede\s+)?)?respira(r)?\b|dificultad\s+para\s+respirar/,
	/(sangrad[oa]\s+(abundante|much[io]simo))|\bhemorragia\b/,
	/\batropell(ad[oa]|o)\b|\baccidente\b/,
	/(no\s+(puede\s+)?)orinar\b|no\s+hace\s+pip[ií]\b|no\s+puede\s+mear\b/,
	/\binconscient(e|a)\b|\bdesmayad[oa]\b/,
	/\bintoxicaci[oó]n\b|\benvenenamiento\b|\bveneno\b/
];

function normalizeText(input) {
	return String(input || '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function matchesAny(patterns, normalized) {
	return patterns.some((re) => re.test(normalized));
}

/**
 * Clasifica rápidamente el texto ANTES de llamar a IA.
 * - rojo: urgencia inmediata (palabras críticas)
 * - amarillo: revisar pronto (síntomas potencialmente preocupantes, sin palabras críticas)
 * - verde: leve (por defecto)
 */
function detectUrgencyLevel(userText) {
	const text = normalizeText(userText);
	if (!text) return { urgencyLevel: 'verde', triggers: [] };

	if (matchesAny(CRITICAL_PATTERNS, text)) {
		return { urgencyLevel: 'rojo', triggers: ['critical_pattern'] };
	}

	// Señales suaves (heurística rápida)
	const yellowSignals = [
		'vomito',
		'vomita',
		'diarrea',
		'sangre',
		'letargo',
		'no come',
		'no quiere comer',
		'no bebe',
		'dolor',
		'cojea',
		'fiebre',
		'respira rapido',
		'jadea',
		'se queja',
		'abdomen hinchado',
		'ojos amarillos'
	];

	const matched = yellowSignals.filter((k) => text.includes(normalizeText(k)));
	if (matched.length > 0) {
		return { urgencyLevel: 'amarillo', triggers: matched.slice(0, 5) };
	}

	return { urgencyLevel: 'verde', triggers: [] };
}

module.exports = {
	CRITICAL_KEYWORDS,
	detectUrgencyLevel
};

