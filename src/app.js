'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Seguridad básica
app.use(helmet());

// CORS
app.use(
	cors({
		origin: process.env.CLIENT_URL || '*',
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rutas
app.use('/api', routes);

// Healthcheck
app.get('/health', (req, res) => {
	return res.status(200).json({ status: 'ok' });
});

// Manejador global de errores (último)
app.use(errorHandler);

module.exports = app;