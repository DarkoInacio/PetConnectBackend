'use strict';

const PDFDocument = require('pdfkit');
const Pet = require('../models/Pet');
const ClinicalEncounter = require('../models/ClinicalEncounter');
const User = require('../models/User');
const { vetHasAccessToPet } = require('./petAccess.service');

function vetDisplayName(u) {
	if (!u) return '';
	return `${u.name || ''} ${u.lastName || ''}`.trim();
}

async function assertPdfAccess({ petId, requesterId, requesterRole }) {
	const pet = await Pet.findById(petId).populate('ownerId', 'name lastName email phone');
	if (!pet) {
		const err = new Error('Mascota no encontrada');
		err.status = 404;
		throw err;
	}
	if (requesterRole === 'dueno' && String(pet.ownerId._id || pet.ownerId) !== requesterId) {
		const err = new Error('No autorizado');
		err.status = 403;
		throw err;
	}
	if (requesterRole === 'proveedor') {
		const ok = await vetHasAccessToPet(requesterId, petId);
		if (!ok) {
			const err = new Error('No autorizado');
			err.status = 403;
			throw err;
		}
	}
	if (requesterRole !== 'dueno' && requesterRole !== 'proveedor') {
		const err = new Error('No autorizado');
		err.status = 403;
		throw err;
	}
	return pet;
}

/**
 * Genera PDF en stream con marca de agua (fecha descarga + quien descargo).
 */
async function streamMedicalRecordPdf(res, { petId, requesterId, requesterRole, requesterEmail }) {
	const pet = await assertPdfAccess({ petId, requesterId, requesterRole });
	const ownerDoc = pet.ownerId;

	const encounters = await ClinicalEncounter.find({ petId })
		.sort({ occurredAt: -1 })
		.populate('providerId', 'name lastName email')
		.lean();

	const downloader = await User.findById(requesterId).select('name lastName email role');
	const downloaderLine = `${vetDisplayName(downloader) || 'Usuario'} <${downloader?.email || requesterEmail || ''}> — ${downloader?.role || requesterRole}`;
	const downloadedAt = new Date().toISOString();

	res.setHeader('Content-Type', 'application/pdf');
	res.setHeader('Content-Disposition', `attachment; filename="ficha-medica-${petId}.pdf"`);

	const doc = new PDFDocument({ margin: 50, size: 'A4' });
	doc.pipe(res);

	const watermarkText = `Descarga: ${downloadedAt}\n${downloaderLine}`;

	function drawWatermark() {
		doc.save();
		doc.opacity(0.12);
		doc.fontSize(9);
		doc.fillColor('#444444');
		let y = 120;
		for (let i = 0; i < 8; i++) {
			doc.text(watermarkText, 40, y, { width: 520, align: 'center' });
			y += 90;
		}
		doc.restore();
	}

	drawWatermark();

	doc.fontSize(18).fillColor('#111111').text('Ficha medica — PetConnect', { align: 'center' });
	doc.moveDown();
	doc.fontSize(11).fillColor('#333333');
	doc.text(`Mascota: ${pet.name} (${pet.species})`);
	if (pet.breed) doc.text(`Raza: ${pet.breed}`);
	doc.text(`Sexo: ${pet.sex}`);
	if (pet.color) doc.text(`Color: ${pet.color}`);
	if (pet.birthDate) doc.text(`Fecha de nacimiento: ${new Date(pet.birthDate).toISOString().slice(0, 10)}`);
	doc.text(`Estado ficha: ${pet.status === 'deceased' ? 'Fallecida' : 'Activa'}`);
	doc.moveDown();

	doc.fontSize(12).text('Datos del dueno', { underline: true });
	doc.fontSize(10);
	if (ownerDoc) {
		doc.text(`${vetDisplayName(ownerDoc)} — ${ownerDoc.email || ''}`);
		if (ownerDoc.phone) doc.text(`Telefono: ${ownerDoc.phone}`);
	}
	doc.moveDown();

	doc.fontSize(12).text('Historial clinico', { underline: true });
	doc.moveDown();

	if (!encounters.length) {
		doc.fontSize(10).text('Sin atenciones registradas.');
	} else {
		for (const e of encounters) {
			const vetName = vetDisplayName(e.providerId);
			doc.fontSize(10).fillColor('#000000');
			doc.text(
				`${new Date(e.occurredAt).toISOString()} — ${e.type} — ${vetName || 'Veterinaria'}`,
				{ continued: false }
			);
			doc.fontSize(9).fillColor('#333333');
			doc.text(`Motivo: ${e.motivo || ''}`);
			doc.text(`Diagnostico: ${(e.diagnostico || '').slice(0, 500)}`);
			if (e.tratamiento) doc.text(`Tratamiento: ${(e.tratamiento || '').slice(0, 400)}`);
			if (e.signedByName) doc.text(`Firmado por: ${e.signedByName} (${new Date(e.signedAt).toISOString()})`);
			doc.moveDown(0.5);
		}
	}

	doc.end();
}

module.exports = { streamMedicalRecordPdf, assertPdfAccess };
