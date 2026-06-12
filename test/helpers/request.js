'use strict';

const request = require('supertest');
const app = require('../../src/app');

function api() {
	return request(app);
}

module.exports = { api };
