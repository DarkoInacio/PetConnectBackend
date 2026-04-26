'use strict';

const multer = require('multer');
const path = require('path');
const { uploadsRoot, ensureDir } = require('./uploads');

ensureDir(uploadsRoot);
const uploadsDir = uploadsRoot;

const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, uploadsDir);
	},
	filename: function (req, file, cb) {
		const ext = path.extname(file.originalname);
		const base = path.basename(file.originalname, ext).replace(/\s+/g, '_');
		const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
		cb(null, `${base}-${unique}${ext}`);
	}
});

function imageFileFilter(req, file, cb) {
	if (!file.mimetype.startsWith('image/')) {
		return cb(new Error('Solo se permiten archivos de imagen'), false);
	}
	cb(null, true);
}

const upload = multer({
	storage,
	fileFilter: imageFileFilter,
	limits: {
		fileSize: 2 * 1024 * 1024
	}
});

const ALLOWED_PROVIDER_MIMES = new Set(['image/jpeg', 'image/png']);

function providerGalleryFilter(req, file, cb) {
	if (!ALLOWED_PROVIDER_MIMES.has(file.mimetype)) {
		return cb(new Error('Solo se permiten imágenes JPG o PNG'), false);
	}
	cb(null, true);
}

const uploadProviderGallery = multer({
	storage,
	fileFilter: providerGalleryFilter,
	limits: {
		fileSize: 2 * 1024 * 1024
	}
});

module.exports = { upload, uploadProviderGallery };
