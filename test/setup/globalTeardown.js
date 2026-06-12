'use strict';

const fs = require('fs');
const path = require('path');

const globalConfigPath = path.join(__dirname, 'globalConfig.json');

module.exports = async function globalTeardown() {
	if (global.__MONGOD__) {
		await global.__MONGOD__.stop();
	}
	if (fs.existsSync(globalConfigPath)) {
		fs.unlinkSync(globalConfigPath);
	}
};
