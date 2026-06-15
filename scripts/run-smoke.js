/**
 * Orquesta smoke Newman: seed → espera health → newman (carpeta Smoke).
 * Requiere API levantada (p. ej. npm start en otra terminal o CI).
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const newman = require('newman');

const root = path.join(__dirname, '..');

function runNode(script, label) {
	console.log(`\n> ${label}`);
	const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
		cwd: root,
		stdio: 'inherit',
		shell: false
	});
	if (result.status !== 0) {
		process.exit(result.status || 1);
	}
}

function runSmoke() {
	return new Promise((resolve, reject) => {
		console.log('\n> Newman Smoke');
		newman.run(
			{
				collection: path.join(root, 'postman/PetConnect.postman_collection.json'),
				environment: path.join(root, 'postman/PetConnect-CI.postman_environment.json'),
				folder: 'Smoke',
				reporters: 'cli',
				color: 'on',
				timeoutRequest: 10000
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

async function main() {
	runNode('seed-smoke.js', 'Seed smoke');
	runNode('wait-for-health.js', 'Wait health');

	const code = await runSmoke();
	if (code !== 0) {
		process.exit(1);
	}

	console.log('\nSmoke Newman completado.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
