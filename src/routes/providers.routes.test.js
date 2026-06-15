'use strict';

const { api } = require('../../test/helpers/request');
const {
	createOwner,
	createVetProvider,
	createWalkerProvider,
	buildAuthHeader
} = require('../../test/helpers/factories');

describe('GET /api/proveedores (público)', () => {
	it('lista proveedores aprobados sin autenticación', async () => {
		await createVetProvider({ name: 'Clinica', lastName: 'Publica' });
		const res = await api().get('/api/proveedores?tipo=veterinaria&limite=5');
		expect(res.status).toBe(200);
		expect(res.body.resultados).toBeDefined();
	});

	it('responde 400 con tipo inválido', async () => {
		const res = await api().get('/api/proveedores?tipo=dragon');
		expect(res.status).toBe(400);
	});
});

describe('GET /api/proveedores/buscar y /mapa', () => {
	it('busca veterinarias por tipo', async () => {
		await createVetProvider();
		const res = await api().get('/api/proveedores/buscar?tipo=veterinaria&pagina=1&limite=5');
		expect(res.status).toBe(200);
		expect(res.body.resultados).toBeDefined();
	});

	it('devuelve marcadores del mapa', async () => {
		await createVetProvider();
		const res = await api().get('/api/proveedores/mapa?lat=-33.4489&lng=-70.6693&radioKm=15');
		expect(res.status).toBe(200);
		expect(res.body.markers).toBeDefined();
	});
});

describe('PUT /api/proveedores/mi-perfil', () => {
	it('responde 401 sin token', async () => {
		const res = await api().put('/api/proveedores/mi-perfil').send({});
		expect(res.status).toBe(401);
	});

	it('responde 403 si el rol no es proveedor', async () => {
		const owner = await createOwner();
		const res = await api().put('/api/proveedores/mi-perfil').set(buildAuthHeader(owner)).send({});
		expect(res.status).toBe(403);
	});
});

describe('GET /api/proveedores/:id/perfil y /perfil/:tipo/:slug', () => {
	it('expone perfil público por id', async () => {
		const vet = await createVetProvider({
			providerProfile: {
				isPublished: true,
				publicSlug: 'vet-publica-jest',
				description: 'Clínica visible',
				address: {
					city: 'Santiago',
					commune: 'Providencia',
					coordinates: { lat: -33.4489, lng: -70.6693 }
				}
			}
		});

		const res = await api().get(`/api/proveedores/${vet._id}/perfil`);
		expect(res.status).toBe(200);
		expect(res.body.proveedor).toBeDefined();
	});

	it('expone perfil público por slug', async () => {
		await createVetProvider({
			providerProfile: {
				isPublished: true,
				publicSlug: 'clinica-slug-jest',
				description: 'Por slug',
				address: {
					city: 'Santiago',
					commune: 'Providencia',
					coordinates: { lat: -33.4489, lng: -70.6693 }
				}
			}
		});

		const res = await api().get('/api/proveedores/perfil/veterinaria/clinica-slug-jest');
		expect(res.status).toBe(200);
		expect(res.body.proveedor).toBeDefined();
	});
});

describe('POST /api/proveedores/solicitar-servicio', () => {
	it('responde 401 sin autenticación', async () => {
		const res = await api().post('/api/proveedores/solicitar-servicio').send({});
		expect(res.status).toBe(401);
	});

	it('crea solicitud a paseador (caso feliz)', async () => {
		const owner = await createOwner();
		const walker = await createWalkerProvider();

		const res = await api()
			.post('/api/proveedores/solicitar-servicio')
			.set(buildAuthHeader(owner))
			.send({
				providerId: walker._id.toString(),
				pet: { name: 'Toby', species: 'perro' },
				message: 'Paseo de prueba'
			});

		expect(res.status).toBe(201);
		expect(res.body.appointment).toBeDefined();
	});

	it('responde 400 si el proveedor no es paseador ni cuidador', async () => {
		const owner = await createOwner();
		const vet = await createVetProvider();

		const res = await api()
			.post('/api/proveedores/solicitar-servicio')
			.set(buildAuthHeader(owner))
			.send({
				providerId: vet._id.toString(),
				pet: { name: 'Toby', species: 'perro' }
			});

		expect(res.status).toBe(400);
	});
});
