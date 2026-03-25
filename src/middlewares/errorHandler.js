'use strict';

const multer = require('multer');

// Manejador global de errores
function errorHandler(err, req, res, next) {
	console.error(err);
	if (res.headersSent) {
		return next(err);
	}

	if (err instanceof multer.MulterError) {
		if (err.code === 'LIMIT_FILE_SIZE') {
			return res.status(400).json({ message: 'Cada imagen debe pesar como máximo 2MB' });
		}
		if (err.code === 'LIMIT_FILE_COUNT') {
			return res.status(400).json({ message: 'Máximo 3 imágenes permitidas' });
		}
		if (err.code === 'LIMIT_UNEXPECTED_FILE') {
			return res.status(400).json({ message: 'Use el campo de archivo "photos" (hasta 3 archivos)' });
		}
		return res.status(400).json({ message: err.message || 'Error al subir archivos' });
	}

	if (err.message === 'Solo se permiten imágenes JPG o PNG' || err.message === 'Solo se permiten archivos de imagen') {
		return res.status(400).json({ message: err.message });
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