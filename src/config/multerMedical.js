'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const clinicalDir = path.join(__dirname, '..', 'uploads', 'clinical');
if (!fs.existsSync(clinicalDir)) {
	fs.mkdirSync(clinicalDir, { recursive: true });
}

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
