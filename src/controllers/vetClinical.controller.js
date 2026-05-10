'use strict';

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Pet = require('../models/Pet');
const ClinicalEncounter = require('../models/ClinicalEncounter');
const User = require('../models/User');
const { assertVetAppointmentForPet, vetHasAccessToPet } = require('../services/petAccess.service');
const { uploadsRoot } = require('../config/uploads');

const LATE_CREATE_MS = 72 * 60 * 60 * 1000;

function vetDisplayName(u) {
	if (!u) return 'Veterinaria';
	return `${u.name || ''} ${u.lastName || ''}`.trim() || 'Veterinaria';
}

function isWithinClinicalEditWindow(appt) {
	if (!appt || !appt.startAt || !appt.endAt) return false;
	const start = new Date(appt.startAt).getTime();
	const end = new Date(appt.endAt).getTime();
	const now = Date.now();
	return now >= start && now <= end + 2 * 60 * 60 * 1000;
}

function canCreateEncounterForAppointment(appt) {
	if (!['confirmed', 'completed'].includes(appt.status)) {
		return false;
	}
	const deadline = new Date(appt.endAt).getTime() + LATE_CREATE_MS;
	return Date.now() <= deadline;
}

function parseJsonField(raw, fieldName) {
	if (raw === undefined || raw === null || raw === '') {
		return { ok: true, value: undefined };
	}
	try {
		return { ok: true, value: JSON.parse(raw) };
	} catch {
		return { ok: false, error: `${fieldName} debe ser JSON valido` };
	}
}

async function createClinicalEncounter(req, res, next) {
	try {
		const { petId } = req.params;
		if (!mongoose.isValidObjectId(petId)) {
			return res.status(400).json({ message: 'petId invalido' });
		}

		const pet = await Pet.findById(petId);
		if (!pet) {
			return res.status(404).json({ message: 'Mascota no encontrada' });
		}
		if (pet.status === 'deceased') {
			return res.status(400).json({ message: 'La ficha esta fallecida; no se pueden agregar atenciones' });
		}

		const appointmentId = req.body.appointmentId;
		if (!appointmentId || !mongoose.isValidObjectId(appointmentId)) {
			return res.status(400).json({ message: 'appointmentId es obligatorio' });
		}

		const appt = await assertVetAppointmentForPet({
			appointmentId,
			providerUserId: req.user.id,
			petId
		});
		if (!appt) {
			return res.status(403).json({ message: 'Cita no valida para esta mascota o no confirmada' });
		}
		if (!canCreateEncounterForAppointment(appt)) {
			return res.status(400).json({ message: 'Fuera del plazo para registrar la atencion de esta cita' });
		}

		const existing = await ClinicalEncounter.findOne({ appointmentId }).select('_id').lean();
		if (existing) {
			return res.status(409).json({ message: 'Ya existe un registro clinico para esta cita' });
		}

		const type = req.body.type || 'consulta';
		if (!ClinicalEncounter.ENCOUNTER_TYPES.includes(type)) {
			return res.status(400).json({ message: `type invalido: ${ClinicalEncounter.ENCOUNTER_TYPES.join(', ')}` });
		}

		const motivo = req.body.motivo != null ? String(req.body.motivo).trim() : '';
		if (!motivo) {
			return res.status(400).json({ message: 'motivo es obligatorio' });
		}

		let occurredAt = appt.startAt;
		if (req.body.occurredAt) {
			const d = new Date(req.body.occurredAt);
			if (!Number.isNaN(d.getTime())) {
				occurredAt = d;
			}
		}

		const medParsed = parseJsonField(req.body.medications, 'medications');
		if (!medParsed.ok) {
			return res.status(400).json({ message: medParsed.error });
		}
		let medications = [];
		if (Array.isArray(medParsed.value)) {
			medications = medParsed.value.map((m) => ({
				nombre: String(m.nombre || m.name || '').trim(),
				dosis: String(m.dosis || m.dose || '').trim(),
				frecuencia: String(m.frecuencia || m.frequency || '').trim(),
				duracion: String(m.duracion || m.duration || '').trim()
			}));
			medications = medications.filter((m) => m.nombre);
		}

		const proxParsed = parseJsonField(req.body.proximoControl, 'proximoControl');
		if (!proxParsed.ok) {
			return res.status(400).json({ message: proxParsed.error });
		}
		let proximoControl;
		if (proxParsed.value && typeof proxParsed.value === 'object') {
			const f = proxParsed.value.fecha ? new Date(proxParsed.value.fecha) : null;
			proximoControl = {
				fecha: f && !Number.isNaN(f.getTime()) ? f : undefined,
				motivo: proxParsed.value.motivo != null ? String(proxParsed.value.motivo).trim() : ''
			};
		}

		const vetUser = await User.findById(req.user.id).select('name lastName');
		const signedByName = vetDisplayName(vetUser);
		const signedAt = new Date();

		const attachments = [];
		const files = req.files || [];
		if (files.length > 3) {
			return res.status(400).json({ message: 'Maximo 3 archivos adjuntos' });
		}
		for (const f of files) {
			attachments.push({
				filename: `clinical/${path.basename(f.path)}`,
				originalName: f.originalname || '',
				mime: f.mimetype,
				size: f.size
			});
		}

		const encounter = await ClinicalEncounter.create({
			petId,
			providerId: req.user.id,
			appointmentId,
			type,
			occurredAt,
			motivo,
			diagnostico: req.body.diagnostico != null ? String(req.body.diagnostico).trim() : '',
			tratamiento: req.body.tratamiento != null ? String(req.body.tratamiento).trim() : '',
			medications,
			observaciones: req.body.observaciones != null ? String(req.body.observaciones).trim() : '',
			proximoControl,
			attachments,
			signedAt,
			signedByName
		});

		const fresh = await ClinicalEncounter.findById(encounter._id).populate('providerId', 'name lastName email').lean();
		return res.status(201).json({ encounter: fresh });
	} catch (err) {
		next(err);
	}
}

async function updateClinicalEncounter(req, res, next) {
	try {
		const { encounterId } = req.params;
		if (!mongoose.isValidObjectId(encounterId)) {
			return res.status(400).json({ message: 'Id invalido' });
		}

		const enc = await ClinicalEncounter.findById(encounterId);
		if (!enc) {
			return res.status(404).json({ message: 'Atencion no encontrada' });
		}
		if (String(enc.providerId) !== req.user.id) {
			return res.status(403).json({ message: 'Solo la veterinaria autora puede editar' });
		}

		const pet = await Pet.findById(enc.petId).select('status').lean();
		if (!pet || pet.status === 'deceased') {
			return res.status(400).json({ message: 'La ficha esta fallecida; no se puede editar' });
		}

		const appt = await Appointment.findById(enc.appointmentId).lean();
		if (!appt) {
			return res.status(400).json({ message: 'Cita asociada no encontrada' });
		}
		if (!isWithinClinicalEditWindow(appt)) {
			return res.status(400).json({
				message: 'La edicion solo esta permitida durante la consulta y hasta 2 horas despues del fin del bloque'
			});
		}

		const { type, motivo, diagnostico, tratamiento, observaciones, occurredAt } = req.body || {};
		if (type !== undefined) {
			if (!ClinicalEncounter.ENCOUNTER_TYPES.includes(type)) {
				return res.status(400).json({ message: 'type invalido' });
			}
			enc.type = type;
		}
		if (motivo !== undefined) {
			const m = String(motivo).trim();
			if (!m) {
				return res.status(400).json({ message: 'motivo no puede quedar vacio' });
			}
			enc.motivo = m;
		}
		if (diagnostico !== undefined) enc.diagnostico = String(diagnostico).trim();
		if (tratamiento !== undefined) enc.tratamiento = String(tratamiento).trim();
		if (observaciones !== undefined) enc.observaciones = String(observaciones).trim();
		if (occurredAt !== undefined) {
			const d = new Date(occurredAt);
			if (!Number.isNaN(d.getTime())) {
				enc.occurredAt = d;
			}
		}

		const medParsed = parseJsonField(req.body.medications, 'medications');
		if (!medParsed.ok) {
			return res.status(400).json({ message: medParsed.error });
		}
		if (medParsed.value !== undefined) {
			if (!Array.isArray(medParsed.value)) {
				return res.status(400).json({ message: 'medications debe ser un arreglo' });
			}
			enc.medications = medParsed.value
				.map((m) => ({
					nombre: String(m.nombre || m.name || '').trim(),
					dosis: String(m.dosis || '').trim(),
					frecuencia: String(m.frecuencia || '').trim(),
					duracion: String(m.duracion || '').trim()
				}))
				.filter((m) => m.nombre);
		}

		const proxParsed = parseJsonField(req.body.proximoControl, 'proximoControl');
		if (!proxParsed.ok) {
			return res.status(400).json({ message: proxParsed.error });
		}
		if (proxParsed.value !== undefined) {
			if (proxParsed.value === null) {
				enc.proximoControl = undefined;
			} else if (typeof proxParsed.value === 'object') {
				const f = proxParsed.value.fecha ? new Date(proxParsed.value.fecha) : null;
				enc.proximoControl = {
					fecha: f && !Number.isNaN(f.getTime()) ? f : undefined,
					motivo: proxParsed.value.motivo != null ? String(proxParsed.value.motivo).trim() : ''
				};
			}
		}

		if (req.files && req.files.length) {
			const current = enc.attachments || [];
			if (current.length + req.files.length > 3) {
				return res.status(400).json({ message: 'Maximo 3 adjuntos en total' });
			}
			for (const f of req.files) {
				current.push({
					filename: `clinical/${path.basename(f.path)}`,
					originalName: f.originalname || '',
					mime: f.mimetype,
					size: f.size
				});
			}
			enc.attachments = current;
		}

		await enc.save();
		const fresh = await ClinicalEncounter.findById(enc._id).populate('providerId', 'name lastName email').lean();
		return res.status(200).json({ message: 'Atencion actualizada', encounter: fresh });
	} catch (err) {
		next(err);
	}
}

async function listVetClinicalEncounters(req, res, next) {
	try {
		const { petId } = req.params;
		if (!mongoose.isValidObjectId(petId)) {
			return res.status(400).json({ message: 'petId invalido' });
		}
		const pet = await Pet.findById(petId).lean();
		if (!pet) {
			return res.status(404).json({ message: 'Mascota no encontrada' });
		}
		const canAccess = await vetHasAccessToPet(req.user.id, petId);
		if (!canAccess) {
			return res.status(403).json({ message: 'No autorizado' });
		}

		const encounters = await ClinicalEncounter.find({ petId, providerId: req.user.id })
			.sort({ occurredAt: -1 })
			.lean();

		const items = encounters.map((e) => ({
			id: e._id,
			type: e.type,
			occurredAt: e.occurredAt,
			motivo: e.motivo,
			diagnosticoResumen: (e.diagnostico || '').slice(0, 160),
			veterinaria: '',
			attachmentCount: (e.attachments || []).length
		}));

		return res.status(200).json({ encounters: items });
	} catch (err) {
		next(err);
	}
}

async function getVetClinicalEncounterDetail(req, res, next) {
	try {
		const { petId, encounterId } = req.params;
		if (!mongoose.isValidObjectId(petId) || !mongoose.isValidObjectId(encounterId)) {
			return res.status(400).json({ message: 'Id invalido' });
		}
		const pet = await Pet.findById(petId).lean();
		if (!pet) {
			return res.status(404).json({ message: 'Mascota no encontrada' });
		}
		const canAccess = await vetHasAccessToPet(req.user.id, petId);
		if (!canAccess) {
			return res.status(403).json({ message: 'No autorizado' });
		}

		const enc = await ClinicalEncounter.findOne({
			_id: encounterId,
			petId,
			providerId: req.user.id
		})
			.populate('providerId', 'name lastName email')
			.lean();
		if (!enc) {
			return res.status(404).json({ message: 'Atencion no encontrada' });
		}

		const encounter = {
			...enc,
			attachments: (enc.attachments || []).map((a, i) => ({
				...a,
				name: a.originalName || '',
				index: i
			}))
		};

		return res.status(200).json({ encounter });
	} catch (err) {
		next(err);
	}
}

async function downloadVetEncounterAttachment(req, res, next) {
	try {
		const { petId, encounterId, index } = req.params;
		const idx = Number(index);
		if (!mongoose.isValidObjectId(petId) || !mongoose.isValidObjectId(encounterId)) {
			return res.status(400).json({ message: 'Id invalido' });
		}
		if (!Number.isInteger(idx) || idx < 0) {
			return res.status(400).json({ message: 'Indice invalido' });
		}

		const pet = await Pet.findById(petId).lean();
		if (!pet) {
			return res.status(404).json({ message: 'Mascota no encontrada' });
		}
		const canAccess = await vetHasAccessToPet(req.user.id, petId);
		if (!canAccess) {
			return res.status(403).json({ message: 'No autorizado' });
		}

		const enc = await ClinicalEncounter.findOne({
			_id: encounterId,
			petId,
			providerId: req.user.id
		}).lean();
		if (!enc || !enc.attachments || !enc.attachments[idx]) {
			return res.status(404).json({ message: 'Adjunto no encontrado' });
		}
		const att = enc.attachments[idx];
		const relPath = att.filename.startsWith('clinical/') ? att.filename : `clinical/${att.filename}`;
		const abs = path.join(uploadsRoot, relPath);
		if (!fs.existsSync(abs)) {
			return res.status(404).json({ message: 'Archivo no encontrado' });
		}
		res.setHeader('Content-Type', att.mime || 'application/octet-stream');
		res.setHeader(
			'Content-Disposition',
			`attachment; filename="${encodeURIComponent(att.originalName || 'adjunto')}"`
		);
		res.setHeader('Cache-Control', 'private, no-store');
		return fs.createReadStream(abs).pipe(res);
	} catch (err) {
		next(err);
	}
}

async function addRetractionComment(req, res, next) {
	try {
		const { encounterId } = req.params;
		const text = req.body?.text != null ? String(req.body.text).trim() : '';
		if (!text) {
			return res.status(400).json({ message: 'text es obligatorio' });
		}
		if (!mongoose.isValidObjectId(encounterId)) {
			return res.status(400).json({ message: 'Id invalido' });
		}

		const enc = await ClinicalEncounter.findById(encounterId);
		if (!enc) {
			return res.status(404).json({ message: 'Atencion no encontrada' });
		}
		if (String(enc.providerId) !== req.user.id) {
			return res.status(403).json({ message: 'Solo la veterinaria autora puede agregar comentarios' });
		}

		const pet = await Pet.findById(enc.petId).select('status').lean();
		if (!pet || pet.status === 'deceased') {
			return res.status(400).json({ message: 'La ficha esta fallecida; no se pueden agregar comentarios' });
		}

		const appt = await Appointment.findById(enc.appointmentId).lean();
		if (!appt) {
			return res.status(400).json({ message: 'Cita asociada no encontrada' });
		}
		if (isWithinClinicalEditWindow(appt)) {
			return res.status(400).json({
				message: 'Aun esta en ventana de edicion completa; edita el registro directamente'
			});
		}

		const vetUser = await User.findById(req.user.id).select('name lastName');
		enc.retractionComments.push({
			text,
			providerId: req.user.id,
			signerName: vetDisplayName(vetUser)
		});
		await enc.save();

		const fresh = await ClinicalEncounter.findById(enc._id).lean();
		return res.status(201).json({ message: 'Comentario agregado', encounter: fresh });
	} catch (err) {
		next(err);
	}
}

module.exports = {
	createClinicalEncounter,
	updateClinicalEncounter,
	addRetractionComment,
	listVetClinicalEncounters,
	getVetClinicalEncounterDetail,
	downloadVetEncounterAttachment
};
