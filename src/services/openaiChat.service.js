'use strict';

const { tryParseJsonChatResponse } = require('./chatLlmShared.service');

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

function mapOpenAiHttpFailure(status, text) {
	const errSlice = `OpenAI ${status}: ${text}`.slice(0, 500);
	let failureKind = 'http';
	const raw = String(text || '');
	try {
		const j = text ? JSON.parse(text) : null;
		const errObj = j?.error || {};
		const errCode = String(errObj?.code || '').toLowerCase();
		const errMsg = String(errObj?.message || '').toLowerCase();

		if (status === 401) {
			failureKind = 'auth';
		} else if (status === 403) {
			failureKind = 'auth';
		} else if (status === 404) {
			failureKind = 'model';
		} else if (status === 429) {
			if (/quota|billing|insufficient_quota|hard.limit/i.test(errCode + errMsg + raw)) {
				failureKind = 'quota';
			} else {
				failureKind = 'rate_limit';
			}
		} else if (status === 400) {
			if (/model|not.found/i.test(errMsg + raw)) failureKind = 'model';
			else if (/api.key|invalid.*key/i.test(errMsg + raw)) failureKind = 'auth';
		}
	} catch (_) {
		/* sin-op */
	}
	if (process.env.NODE_ENV === 'development') {
		console.warn(`[chat] OpenAI no respondió OK: ${errSlice.replace(/\n/g, ' ')}`);
	}
	return { error: errSlice, failureKind };
}

/**
 * @param {{ messages: {role:string, content:string}[], timeoutMs?: number }} opts
 */
async function callOpenAiChat({ messages, timeoutMs = 8000 }) {
	const apiKey = process.env.OPENAI_API_KEY;
	const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

	if (!apiKey) {
		if (process.env.NODE_ENV === 'development') {
			console.warn('[chat] OPENAI_API_KEY no está definida. Añádela en .env.');
		}
		return { ok: false, error: 'OPENAI_API_KEY no configurada', failureKind: 'no_key' };
	}

	const controller = new AbortController();
	const to = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const resp = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			signal: controller.signal,
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model,
				messages,
				temperature: 0.25,
				max_tokens: 800,
				response_format: { type: 'json_object' }
			})
		});

		const text = await resp.text().catch(() => '');

		if (!resp.ok) {
			const { error, failureKind } = mapOpenAiHttpFailure(resp.status, text);
			return { ok: false, error, failureKind };
		}

		let data;
		try {
			data = JSON.parse(text);
		} catch {
			return { ok: false, error: 'JSON inválido en cuerpo de OpenAI', failureKind: 'http' };
		}

		const content = data?.choices?.[0]?.message?.content;
		if (!content) {
			const finish = data?.choices?.[0]?.finish_reason;
			return {
				ok: false,
				error: `Respuesta vacía de OpenAI${finish ? ` (${finish})` : ''}`,
				failureKind: 'empty'
			};
		}

		const parsed = tryParseJsonChatResponse(String(content));
		if (parsed) return { ok: true, content, parsed };
		return { ok: true, content, parsed: null, parseError: true, raw: content };
	} catch (err) {
		const msg = err?.name === 'AbortError' ? 'timeout' : String(err?.message || err);
		if (process.env.NODE_ENV === 'development') {
			console.warn(`[chat] Llamada a OpenAI: ${msg}`);
		}
		return {
			ok: false,
			error: msg,
			failureKind: err?.name === 'AbortError' ? 'timeout' : 'network'
		};
	} finally {
		clearTimeout(to);
	}
}

module.exports = { callOpenAiChat };
