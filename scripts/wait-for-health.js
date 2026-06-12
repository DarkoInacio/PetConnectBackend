'use strict';

const http = require('http');

const host = process.env.SMOKE_BASE_HOST || `http://localhost:${process.env.PORT || 3000}`;
const healthUrl = new URL('/health', host);
const maxAttempts = Number(process.env.HEALTH_WAIT_ATTEMPTS || 30);
const delayMs = Number(process.env.HEALTH_WAIT_DELAY_MS || 1000);

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function ping() {
	return new Promise((resolve, reject) => {
		const req = http.get(healthUrl, (res) => {
			let body = '';
			res.on('data', (chunk) => {
				body += chunk;
			});
			res.on('end', () => {
				if (res.statusCode !== 200) {
					reject(new Error(`Health ${res.statusCode}`));
					return;
				}
				try {
					const json = JSON.parse(body);
					if (json.status !== 'ok') {
						reject(new Error('Health body invalid'));
						return;
					}
					resolve();
				} catch (e) {
					reject(e);
				}
			});
		});
		req.on('error', reject);
		req.setTimeout(5000, () => {
			req.destroy(new Error('Health timeout'));
		});
	});
}

async function main() {
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			await ping();
			console.log(`Health OK (${healthUrl})`);
			return;
		} catch (err) {
			if (attempt === maxAttempts) {
				console.error(`Health check falló tras ${maxAttempts} intentos:`, err.message);
				process.exit(1);
			}
			await sleep(delayMs);
		}
	}
}

main();
