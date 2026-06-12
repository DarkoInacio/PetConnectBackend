'use strict';

const { api } = require('../../test/helpers/request');

describe('POST /api/chat', () => {
	it('responde 400 sin mensaje', async () => {
		const res = await api().post('/api/chat').send({});
		expect(res.status).toBe(400);
	});

	it('responde 200 a visitante sin token (caso feliz)', async () => {
		const res = await api()
			.post('/api/chat')
			.send({ message: 'Hola, mi gato no come desde ayer' });

		expect(res.status).toBe(200);
		expect(res.body.message).toBeDefined();
		expect(String(res.body.message).length).toBeGreaterThan(0);
	});
});
