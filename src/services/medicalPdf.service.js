'use strict';

const PDFDocument = require('pdfkit');
const Pet = require('../models/Pet');
const ClinicalEncounter = require('../models/ClinicalEncounter');
const User = require('../models/User');
const { vetHasAccessToPet } = require('./petAccess.service');

const BRAND = '#0d9488';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const PANEL = '#f1f5f9';
const MARGIN = 50;
const A4H = 841.89;
const A4W = 595.28;
const W = A4W - 2 * MARGIN;
const BOTTOM_RESERVE = 45;

function vetDisplayName(u) {
	if (!u) return '';
	return `${u.name || ''} ${u.lastName || ''}`.trim();
}

function formatDateCl(d) {
	if (!d) return '—';
	try {
		return new Date(d).toLocaleDateString('es-CL', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'America/Santiago'
		});
	} catch {
		return String(d);
	}
}

/** Fecha "solo calendario" (nacimiento): evita -1 día al evitar hora local del PDF. */
function formatCivilDateUtc(d) {
	if (!d) return '—';
	try {
		return new Date(d).toLocaleDateString('es-CL', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		});
	} catch {
		return String(d);
	}
}

function formatDateTimeCl(d) {
	if (!d) return '—';
	try {
		return new Date(d).toLocaleString('es-CL', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'America/Santiago'
		});
	} catch {
		return String(d);
	}
}

function typeLabel(t) {
	const m = { consulta: 'Consulta', vacuna: 'Vacuna', otro: 'Otro' };
	return m[t] || t || '—';
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
 * Fondo muy suave, coordenadas absolutas (no altera doc.x/doc.y al volver al contenido
 * gracias a save/restore).
 */
function drawSubtlePageWatermark(doc) {
	const w = doc.page.width;
	const h = doc.page.height;
	doc.save();
	doc.opacity(0.05);
	doc.fillColor(BRAND);
	doc.font('Helvetica', 6);
	for (let x = -20; x < w; x += 105) {
		for (let y0 = 0; y0 < h; y0 += 95) {
			doc.text('PetConnect', x, y0, { lineBreak: false, width: 70 });
		}
	}
	doc.restore();
}

function buildEncounterParagraphs(e, vetName) {
	/** @type {Array<{ k: string, t: string }>} */
	const rows = [];
	rows.push({ k: 'Profesional', t: vetName || '—' });
	rows.push({ k: 'Motivo', t: e.motivo || '—' });
	rows.push({ k: 'Diagnóstico', t: (e.diagnostico || '—').trim() || '—' });
	rows.push({ k: 'Tratamiento', t: (e.tratamiento || '—').trim() || '—' });
	if (e.observaciones && String(e.observaciones).trim()) {
		rows.push({ k: 'Observaciones', t: e.observaciones });
	}
	if (e.medications && e.medications.length) {
		const medText = e.medications
			.map((m) => {
				const parts = [m.nombre, m.dosis, m.frecuencia, m.duracion]
					.map((p) => (p != null ? String(p).trim() : ''))
					.filter(Boolean);
				return parts.join(' · ') || m.nombre;
			})
			.join('\n');
		rows.push({ k: 'Medicación', t: medText || '—' });
	}
	if (e.proximoControl && (e.proximoControl.fecha || (e.proximoControl.motivo && String(e.proximoControl.motivo).trim()))) {
		const pcFecha = e.proximoControl.fecha ? formatDateCl(e.proximoControl.fecha) : '—';
		const pcM = (e.proximoControl.motivo && String(e.proximoControl.motivo).trim()) || '';
		rows.push({ k: 'Próximo control', t: pcM ? `${pcFecha} — ${pcM}` : pcFecha });
	}
	rows.push({ k: 'Firmado', t: `${e.signedByName || '—'} · ${formatDateTimeCl(e.signedAt)}` });
	if (e.attachments && e.attachments.length) {
		rows.push({ k: 'Adjuntos en ficha (plataforma)', t: String(e.attachments.length) });
	}
	return rows;
}

function drawPageDecorationsAndFooters(doc, shortMeta) {
	if (typeof doc.bufferedPageRange !== 'function' || typeof doc.switchToPage !== 'function') {
		return;
	}
	const range = doc.bufferedPageRange();
	const count = range && range.count ? range.count : 0;
	if (!count) {
		return;
	}
	for (let p = 0; p < count; p += 1) {
		doc.switchToPage(range.start + p);
		const ph = doc.page.height;
		drawSubtlePageWatermark(doc);
		doc.save();
		doc.fillColor(MUTED);
		doc.font('Helvetica', 6.3);
		doc.text(
			`PetConnect · Página ${p + 1} de ${count} · ${shortMeta} · Uso informativo`,
			MARGIN,
			ph - 28,
			{ width: W, align: 'center' }
		);
		doc.restore();
	}
}

function sectionLabel(doc) {
	doc.font('Helvetica-Bold', 11.2);
	doc.fillColor('#0f172a');
}

/**
 * Ficha con cabecera coloreada, secciones claras, historial en tarjetas.
 * No se dibuja antes el bucle de marca de agua que dejaba doc.y al final de la hoja
 * (primera pagina "vacia" o solo marca tenue + contenido en pág. 2).
 */
async function streamMedicalRecordPdf(res, { petId, requesterId, requesterRole, requesterEmail }) {
	const pet = await assertPdfAccess({ petId, requesterId, requesterRole });
	const ownerDoc = pet.ownerId;

	const encounters = await ClinicalEncounter.find({ petId })
		.sort({ occurredAt: -1 })
		.populate('providerId', 'name lastName email')
		.lean();

	const downloader = await User.findById(requesterId).select('name lastName email role');
	const shortMeta = `Generado: ${formatDateTimeCl(new Date())} · ${vetDisplayName(downloader) || 'Usuario'}`;

	res.setHeader('Content-Type', 'application/pdf');
	res.setHeader('Content-Disposition', `attachment; filename="ficha-medica-${petId}.pdf"`);

	const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
	doc.pipe(res);

	/* ——— Cabecera: primera hoja con contenido util desde y = MARGIN ——— */
	const headerH = 62;
	doc.save();
	doc.fillColor(BRAND);
	doc.roundedRect(MARGIN, MARGIN, W, headerH, 4);
	doc.fill();
	doc.fillColor('#ffffff');
	doc.font('Helvetica-Bold', 17.5);
	doc.text('Ficha medica', MARGIN, MARGIN + 8, { width: W, align: 'center' });
	doc.font('Helvetica', 9.5);
	doc.fillColor('rgba(255,255,255,0.9)');
	doc.text('Resumen de atenciones clinicas  ·  PetConnect', MARGIN, MARGIN + 34, { width: W, align: 'center' });
	doc.restore();

	let y = MARGIN + headerH + 10;
	doc.x = MARGIN;
	doc.y = y;

	doc.fillColor(MUTED);
	doc.font('Helvetica', 6.8);
	doc.text(
		`Documento: ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}  |  ` +
			`Descargado por: ${vetDisplayName(downloader) || '—'} <${(downloader && downloader.email) || requesterEmail || '—'}>`,
		{ width: W, align: 'right' }
	);
	y = doc.y + 16;

	sectionLabel(doc);
	doc.text('Identificacion de la mascota', MARGIN, y, { width: W });
	doc
		.moveTo(MARGIN, y + 14)
		.lineTo(MARGIN + W, y + 14)
		.lineWidth(0.6)
		.strokeColor(BRAND);
	doc.stroke();
	y += 22;
	doc.x = MARGIN;
	doc.y = y;
	doc.fillColor('#1e293b');
	doc.font('Helvetica', 9);
	doc.text(`Nombre:  ${pet.name || '—'}  ·  Especie: ${pet.species || '—'}  ·  Sexo: ${pet.sex || '—'}`);
	if (pet.breed) {
		doc.moveDown(0.35);
		doc.text(`Raza:  ${pet.breed}`);
	}
	if (pet.color) {
		doc.moveDown(0.35);
		doc.text(`Color:  ${pet.color}`);
	}
	if (pet.birthDate) {
		doc.moveDown(0.35);
		doc.text(`Fecha de nacimiento:  ${formatCivilDateUtc(pet.birthDate)}`);
	}
	y = doc.y + 14;

	sectionLabel(doc);
	doc.text('Contacto del dueño o dueña', MARGIN, y, { width: W });
	doc
		.moveTo(MARGIN, y + 14)
		.lineTo(MARGIN + W, y + 14)
		.lineWidth(0.6)
		.strokeColor(BRAND);
	doc.stroke();
	y += 22;
	doc.x = MARGIN;
	doc.y = y;
	doc.font('Helvetica', 9);
	if (ownerDoc) {
		doc.text(`${vetDisplayName(ownerDoc) || '—'}`);
		doc.moveDown(0.35);
		doc.text(`Email:  ${ownerDoc.email || '—'}`);
		if (ownerDoc.phone) {
			doc.moveDown(0.35);
			doc.text(`Telefono:  ${ownerDoc.phone}`);
		}
	} else {
		doc.fillColor(MUTED);
		doc.text('Sin datos de contacto en el sistema.');
	}
	y = doc.y + 16;

	sectionLabel(doc);
	doc.text('Historial de atenciones', MARGIN, y, { width: W });
	doc
		.moveTo(MARGIN, y + 14)
		.lineTo(MARGIN + W, y + 14)
		.lineWidth(0.6)
		.strokeColor(BRAND);
	doc.stroke();
	y += 22;

	doc.x = MARGIN;
	doc.y = y;
	if (!encounters.length) {
		doc.save();
		doc.fillColor(PANEL);
		doc.roundedRect(MARGIN, y, W, 38, 3);
		doc.fill();
		doc.strokeColor(BORDER);
		doc.lineWidth(0.5);
		doc.roundedRect(MARGIN, y, W, 38, 3);
		doc.stroke();
		doc.fillColor(MUTED);
		doc.font('Helvetica-Oblique', 9.5);
		doc.text('Aun no hay atenciones registradas en ficha clínica.', MARGIN + 10, y + 11, { width: W - 20 });
		doc.restore();
	} else {
		doc.fillColor(MUTED);
		doc.font('Helvetica', 8.5);
		doc.text(
			`Total: ${encounters.length}  ·  Orden: de la mas reciente a la mas antigua`,
			MARGIN,
			y,
			{ width: W }
		);
		y = doc.y + 6;

		const innerPad = 8;
		const tW = W - 2 * innerPad;
		encounters.forEach((e, i) => {
			const vetName = vetDisplayName(e.providerId);
			const titleLine = `Atencion ${i + 1}  ·  ${typeLabel(e.type)}  ·  ${formatDateTimeCl(
				e.occurredAt
			)}`;
			const bodyRows = buildEncounterParagraphs(e, vetName);
			/* Si no cabe un minimo (titulo + cabecera), salto; el texto largo hace el resto */
			if (y + 72 > A4H - BOTTOM_RESERVE) {
				doc.addPage();
				y = MARGIN;
			}

			const cardY = y;
			const tx = MARGIN + innerPad;
			doc.x = MARGIN;
			doc.y = cardY;
			doc.save();
			doc.moveTo(MARGIN, cardY);
			doc.lineTo(MARGIN + W, cardY);
			doc.lineWidth(1.1);
			doc.strokeColor(BRAND);
			doc.stroke();
			doc.restore();

			doc.x = tx;
			doc.y = cardY + 4;
			doc.fillColor(BRAND);
			doc.font('Helvetica-Bold', 9.1);
			doc.text(titleLine, { width: tW });
			doc.moveDown(0.4);
			for (const { k, t } of bodyRows) {
				doc.fillColor(MUTED);
				doc.font('Helvetica-Bold', 8);
				doc.text(`${k}: `, { width: tW });
				doc.fillColor('#1e293b');
				doc.font('Helvetica', 8.1);
				doc.text(t, { width: tW, lineGap: 1.15 });
				doc.moveDown(0.2);
			}
			const endY = doc.y;
			doc.x = MARGIN;
			doc.save();
			doc.moveTo(MARGIN, endY);
			doc.lineTo(MARGIN + W, endY);
			doc.lineWidth(0.4);
			doc.dash(2, { space: 2 });
			doc.strokeColor(BORDER);
			doc.stroke();
			doc.undash();
			doc.restore();
			y = endY + 8;
		});
	}

	drawPageDecorationsAndFooters(doc, shortMeta);
	doc.end();
}

module.exports = { streamMedicalRecordPdf, assertPdfAccess };
