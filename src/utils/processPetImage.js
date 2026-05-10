'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PET_UPLOAD_SUBDIR = 'pets';

async function processPetImageToJpeg(inputPath, outputDir, outputBasename) {
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}
	const outName = `${outputBasename}.jpg`;
	const outPath = path.join(outputDir, outName);

	await sharp(inputPath)
		.rotate()
		.resize(800, 800, { fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 82, mozjpeg: true })
		.toFile(outPath);

	return path.join(PET_UPLOAD_SUBDIR, outName).replace(/\\/g, '/');
}

async function processPetImageBufferToJpeg(buffer, outputDir, outputBasename) {
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}
	const outName = `${outputBasename}.jpg`;
	const outPath = path.join(outputDir, outName);

	await sharp(buffer)
		.rotate()
		.resize(800, 800, { fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 82, mozjpeg: true })
		.toFile(outPath);

	return path.join(PET_UPLOAD_SUBDIR, outName).replace(/\\/g, '/');
}

module.exports = { processPetImageToJpeg, processPetImageBufferToJpeg, PET_UPLOAD_SUBDIR };
