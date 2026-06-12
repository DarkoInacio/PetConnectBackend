'use strict';

/** @type {import('jest').Config} */
module.exports = {
	testEnvironment: 'node',
	setupFiles: ['<rootDir>/test/setup/mocks.js'],
	setupFilesAfterEnv: ['<rootDir>/test/setup/jest.setup.js'],
	globalSetup: '<rootDir>/test/setup/globalSetup.js',
	globalTeardown: '<rootDir>/test/setup/globalTeardown.js',
	testMatch: ['**/*.test.js'],
	testPathIgnorePatterns: ['/node_modules/'],
	collectCoverageFrom: [
		'src/services/**/*.js',
		'src/validators/**/*.js',
		'src/utils/**/*.js',
		'src/controllers/auth.controller.js',
		'src/controllers/pets.controller.js',
		'src/controllers/vetClinical.controller.js',
		'src/controllers/appointments.controller.js',
		'src/controllers/bookings.controller.js',
		'src/controllers/providerAgenda.controller.js',
		'src/services/petAccess.service.js',
		'src/services/medicalPdf.service.js',
		'src/middlewares/auth.js',
		'src/middlewares/roles.js'
	],
	coverageDirectory: 'coverage',
	coverageReporters: ['text', 'lcov'],
	maxWorkers: 1,
	forceExit: true,
	testTimeout: 30000
};
