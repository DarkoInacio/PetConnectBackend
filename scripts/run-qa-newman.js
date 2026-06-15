/**
 * Newman QA TCP-001 sin seed (asume seed:qa ya corrido y API levantada).
 * Ejecuta cada carpeta en orden; exporta el environment entre runs para encadenar tokens/IDs.
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const newman = require('newman');

const root = path.join(__dirname, '..');
const COLLECTION = path.join(root, 'postman/PetConnect.postman_collection.json');
const ENV_SEED = path.join(root, 'postman/PetConnect-QA.postman_environment.json');
const ENV_EXPORT = path.join(root, 'postman/.qa-newman-env.json');

const QA_FOLDERS = [
	'Auth',
	'Profile',
	'Pets',
	'Providers',
	'Clinic Services',
	'Vet Clinical',
	'Bookings',
	'Chat',
	'Appointments',
	'Agenda',
	'Reviews',
	'Admin',
	'Smoke',
	'Pets cleanup'
];

function runFolder(folder, envPath) {
	return new Promise((resolve, reject) => {
		console.log(`\n> Newman — ${folder}`);
		newman.run(
			{
				collection: COLLECTION,
				environment: envPath,
				exportEnvironment: ENV_EXPORT,
				folder,
				reporters: 'cli',
				color: 'on',
				timeoutRequest: 15000,
				delayRequest: 100
			},
			(err, summary) => {
				if (err) {
					reject(err);
					return;
				}
				const failed = summary?.run?.stats?.assertions?.failed ?? 0;
				const runError = summary?.run?.error || summary?.error;
				if (runError) {
					reject(runError);
					return;
				}
				resolve(failed > 0 ? 1 : 0);
			}
		);
	});
}

function waitStableHealth() {
	console.log('\n> Wait health (estable)');
	const result = spawnSync(process.execPath, [path.join(__dirname, 'wait-for-health.js')], {
		cwd: root,
		stdio: 'inherit',
		shell: false,
		env: { ...process.env, HEALTH_STABLE_CHECKS: '3' }
	});
	if (result.status !== 0) {
		process.exit(result.status || 1);
	}
}

async function main() {
	if (!fs.existsSync(ENV_SEED)) {
		console.error('Falta postman/PetConnect-QA.postman_environment.json — ejecuta npm run seed:qa');
		process.exit(1);
	}

	waitStableHealth();

	let envPath = ENV_SEED;

	for (const folder of QA_FOLDERS) {
		const code = await runFolder(folder, envPath);
		if (code !== 0) {
			console.error(`\nNewman falló en carpeta "${folder}".`);
			process.exit(1);
		}
		if (fs.existsSync(ENV_EXPORT)) {
			envPath = ENV_EXPORT;
		}
	}

	console.log('\nQA Newman TCP-001 completado (14 carpetas).');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
