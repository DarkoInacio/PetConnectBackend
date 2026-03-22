'use strict';

// Carga de variables de entorno
require('dotenv').config();

const http = require('http');
const app = require('./app');
const { connectMongo } = require('./config/db');

const PORT = process.env.PORT || 3000;

async function startServer() {
	// Conectar a MongoDB
	await connectMongo();

	// Iniciar servidor HTTP
	const server = http.createServer(app);
	server.listen(PORT, () => {
		console.log(`Servidor escuchando en puerto ${PORT}`);
	});

	// Manejo de señales para apagado limpio
	const shutdown = (signal) => {
		console.log(`\nRecibida señal ${signal}. Cerrando servidor...`);
		server.close(() => {
			console.log('Servidor cerrado.');
			process.exit(0);
		});
		setTimeout(() => {
			console.warn('Forzando cierre por timeout.');
			process.exit(1);
		}, 10000);
	};
	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch((err) => {
	console.error('Error crítico al iniciar el servidor:', err);
	process.exit(1);
});