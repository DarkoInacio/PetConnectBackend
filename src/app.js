'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');
const { uploadsRoot } = require('./config/uploads');

const app = express();

// Render/Vercel/NGINX: confiar en proxy para leer X-Forwarded-For correctamente (rate-limit, req.ip, etc.)
app.set('trust proxy', 1);

// CORS: CLIENT_URL puede listar varios orígenes separados por coma. En desarrollo se añaden
// 5173 y 5174 (Vite usa 5174 si 5173 está ocupado) aunque .env solo tenga un puerto.
function buildCorsOrigin() {
	const fromEnv = process.env.CLIENT_URL
		? String(process.env.CLIENT_URL)
				.split(/[,;]/)
				.map((s) => s.trim())
				.filter(Boolean)
		: [];
	if (process.env.NODE_ENV === 'production') {
		/* Vercel + orígenes extra en CLIENT_URL. Incluimos Vite en localhost: el front
		 * a veces se sirve ahi mientras VITE_API_BASE_URL apunta a Render. */
		const prodDefaults = ['https://petconnect-web-two.vercel.app'];
		const localVite = [
			'http://localhost:5173',
			'http://localhost:5174',
			'http://127.0.0.1:5173',
			'http://127.0.0.1:5174'
		];
		const allowed = Array.from(new Set([...prodDefaults, ...localVite, ...fromEnv]));
		return allowed.length === 1 ? allowed[0] : allowed;
	}
	const devVite = [
		'http://localhost:5173',
		'http://localhost:5174',
		'http://127.0.0.1:5173',
		'http://127.0.0.1:5174'
	];
	return Array.from(new Set([...devVite, ...fromEnv]));
}

// Seguridad básica
app.use(helmet());

// CORS
app.use(
	cors({
		origin: buildCorsOrigin(),
		methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		credentials: true
	})
);

// Rate limiting
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 100,
	standardHeaders: true,
	legacyHeaders: false
});
app.use('/api', apiLimiter);

// Logger
if (process.env.NODE_ENV !== 'production') {
	app.use(morgan('dev'));
}

// Parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Archivos estáticos (uploads)
app.use('/uploads', express.static(uploadsRoot));

// Rutas
app.use('/api', routes);

// Healthcheck
app.get('/health', (req, res) => {
	return res.status(200).json({ status: 'ok' });
});

// Manejador global de errores (último)
app.use(errorHandler);

module.exports = app;