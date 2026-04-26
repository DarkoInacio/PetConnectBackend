'use strict';

const multer = require('multer');
const path = require('path');
const { uploadsRoot, ensureDir } = require('./uploads');

const clinicalDir = path.join(uploadsRoot, 'clinical');
ensureDir(clinicalDir);

const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, clinicalDir);
	},
	filename: function (req, file, cb) {
		const ext = path.extname(file.originalname) || '';
		const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
		cb(null, `clinical-${unique}${ext}`);
	}
});

const ALLOWED = new Set(['image/jpeg', 'image/png', 'application/pdf']);

function fileFilter(req, file, cb) {
	if (!ALLOWED.has(file.mimetype)) {
		return cb(new Error('Solo se permiten JPG, PNG o PDF'), false);
	}
	cb(null, true);
}

const uploadClinicalAttachments = multer({
	storage,
	fileFilter,
	limits: {
		fileSize: 5 * 1024 * 1024,
		files: 3
	}
});

module.exports = { uploadClinicalAttachments, clinicalDir };
