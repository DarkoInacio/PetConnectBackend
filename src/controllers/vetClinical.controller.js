'use strict';

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Pet = require('../models/Pet');
const ClinicalEncounter = require('../models/ClinicalEncounter');
const User = require('../models/User');
const { assertVetAppointmentForPet } = require('../services/petAccess.service');

const uploadsRoot = path.join(__dirname, '..', 'uploads');

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
	addRetractionComment
};
