/**
 * Orquesta QA TCP-001 con Newman: seed:qa → health → carpetas en orden.
 * Requiere API levantada (npm run dev en otra terminal).
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

function runNode(script, label, extraEnv = {}) {
	console.log(`\n> ${label}`);
	const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
		cwd: root,
		stdio: 'inherit',
		shell: false,
		env: { ...process.env, ...extraEnv }
	});
	if (result.status !== 0) {
		process.exit(result.status || 1);
	}
}

runNode('seed-qa.js', 'Seed QA TCP-001');
runNode('wait-for-health.js', 'Wait health (estable)', { HEALTH_STABLE_CHECKS: '3' });
runNode('run-qa-newman.js', 'Newman QA TCP-001');

console.log('\nQA Newman TCP-001 completado.');
