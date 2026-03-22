'use strict';

// Manejador global de errores
function errorHandler(err, req, res, next) {
	console.error(err);
	if (res.headersSent) {
		return next(err);
	}
	const status = err.status || 500;
	const message = err.message || 'Error interno del servidor';
	return res.status(status).json({
		message,
		// Solo exponer stack en desarrollo
		...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {})
	});
}

module.exports = errorHandler;