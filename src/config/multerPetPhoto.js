'use strict';

const multer = require('multer');

const ALLOWED = new Set(['image/jpeg', 'image/png']);

function fileFilter(req, file, cb) {
	if (!ALLOWED.has(file.mimetype)) {
		return cb(new Error('Solo se permiten imagenes JPG o PNG'), false);
	}
	cb(null, true);
}

const uploadPetPhotoMemory = multer({
	storage: multer.memoryStorage(),
	fileFilter,
	limits: { fileSize: 2 * 1024 * 1024 }
});

module.exports = { uploadPetPhotoMemory };
