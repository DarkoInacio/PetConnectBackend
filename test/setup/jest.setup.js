'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const globalConfigPath = path.join(__dirname, 'globalConfig.json');

beforeAll(async () => {
	const { mongoUri } = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
	process.env.NODE_ENV = 'test';
	process.env.JWT_SECRET = 'test-jwt-secret-petconnect';
	process.env.JWT_EXPIRES_IN = '1h';
	process.env.MONGODB_URI = mongoUri;
	process.env.CLIENT_URL = 'http://localhost:5173';
	process.env.PETCONNECT_API_SCOPE = 'full';

	if (mongoose.connection.readyState === 0) {
		await mongoose.connect(mongoUri);
	}
});

afterEach(async () => {
	const collections = mongoose.connection.collections;
	for (const key of Object.keys(collections)) {
		await collections[key].deleteMany({});
	}
	jest.clearAllMocks();
});

afterAll(async () => {
	await mongoose.disconnect();
});
