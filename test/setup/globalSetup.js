'use strict';

const fs = require('fs');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

const globalConfigPath = path.join(__dirname, 'globalConfig.json');

module.exports = async function globalSetup() {
	const instance = await MongoMemoryServer.create();
	const mongoUri = instance.getUri();
	fs.writeFileSync(globalConfigPath, JSON.stringify({ mongoUri }));
	global.__MONGOD__ = instance;
};
