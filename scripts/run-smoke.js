/**
 * Orquesta smoke Newman: seed → espera health → newman (carpeta Smoke).
 * Requiere API levantada (p. ej. npm start en otra terminal o CI).
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const isWin = process.platform === 'win32';
const npx = isWin ? 'npx.cmd' : 'npx';

function run(cmd, args, label) {
	console.log(`\n> ${label}`);
	const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: isWin });
	if (result.status !== 0) {
		process.exit(result.status || 1);
	}
}

run(process.execPath, ['scripts/seed-smoke.js'], 'Seed smoke');
run(process.execPath, ['scripts/wait-for-health.js'], 'Wait health');

run(
	npx,
	[
		'newman',
		'run',
		'postman/PetConnect.postman_collection.json',
		'-e',
		'postman/PetConnect-CI.postman_environment.json',
		'--folder',
		'Smoke',
		'--reporters',
		'cli',
		'--color',
		'on',
		'--timeout-request',
		'10000'
	],
	'Newman Smoke'
);

console.log('\nSmoke Newman completado.');
