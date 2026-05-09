'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Pet = require('../models/Pet');
const ClinicalEncounter = require('../models/ClinicalEncounter');
const User = require('../models/User');
const { vetCanAccessPet } = require('../utils/vetPetAccess');

const uploadsRoot = path.join(__dirname, '..', 'uploads');

function resolveSafeUpload(relativePath) {
	if (!relativePath || typeof relativePath !== 'string') return null;
	const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
	const full = path.join(uploadsRoot, normalized);
	if (!full.startsWith(uploadsRoot)) return null;
	return full;
}

function parseJsonField(raw, label) {
	if (raw === undefined || raw === null || raw === '') return undefined;
	try {
		return JSON.parse(String(raw));
	} catch {
		throw Object.assign(new Error(`${label} debe ser JSON válido`), { status: 400 });
	}
}

async function listVetClinicalEncounters(req, res, next) {
	try {
		const { petId } = req.params;
		if (!mongoose.isValidObjectId(petId)) {
			return res.status(400).json({ message: 'petId inválido' });
		}

		const me = await User.findById(req.user.id).select('providerType').lean();
		if (!me || me.providerType !== 'veterinaria') {
			return res.status(403).json({ message: 'Solo veterinarias pueden ver este historial' });
		}

		const ok = await vetCanAccessPet(req.user.id, petId);
		if (!ok) return res.status(403).json({ message: 'No tienes citas con esta mascota' });

		const encs = await ClinicalEncounter.find({ petId, providerId: req.user.id })
			.sort({ occurredAt: -1 })
			.lean();

		const encounters = encs.map((e) => ({
			id: String(e._id),
			type: e.type,
			motivo: e.motivo,
			diagnostico: e.diagnostico,
			tratamiento: e.tratamiento,
			observaciones: e.observaciones,
			occurredAt: e.occurredAt,
			appointmentId: e.appointmentId ? String(e.appointmentId) : undefined,
			proximoControl: e.proximoControl || null,
			medications: e.medications || [],
			attachments: (e.attachments || []).map((a, i) => ({
				index: i,
				name: a.originalName || `adjunto-${i + 1}`
			}))
		}));

		return res.status(200).json({ encounters });
	} catch (err) {
		next(err);
	}
}

async function getVetClinicalEncounterDetail(req, res, next) {
	try {
		const { petId, encounterId } = req.params;
		if (!mongoose.isValidObjectId(petId) || !mongoose.isValidObjectId(encounterId)) {
			return res.status(400).json({ message: 'Id inválido' });
		}

		const enc = await ClinicalEncounter.findOne({
			_id: encounterId,
			petId,
			providerId: req.user.id
		}).lean();

		if (!enc) return res.status(404).json({ message: 'Atención no encontrada' });

		const encounter = {
			id: String(enc._id),
			type: enc.type,
			motivo: enc.motivo,
			diagnostico: enc.diagnostico,
			tratamiento: enc.tratamiento,
			observaciones: enc.observaciones,
			occurredAt: enc.occurredAt,
			medications: enc.medications || [],
			proximoControl: enc.proximoControl || null,
			appointmentId: enc.appointmentId ? String(enc.appointmentId) : undefined,
			attachments: (enc.attachments || []).map((a, i) => ({
				index: i,
				name: a.originalName || `adjunto-${i + 1}`
			}))
		};

		return res.status(200).json({ encounter });
	} catch (err) {
		next(err);
	}
}

async function createClinicalEncounter(req, res, next) {
	try {
		const { petId } = req.params;
		const appointmentId = req.body?.appointmentId;
		if (!mongoose.isValidObjectId(petId)) {
			return res.status(400).json({ message: 'petId inválido' });
		}
		if (!appointmentId || !mongoose.isValidObjectId(appointmentId)) {
			return res.status(400).json({ message: 'appointmentId es obligatorio' });
		}

		const me = await User.findById(req.user.id).select('providerType status').lean();
		if (!me || me.providerType !== 'veterinaria') {
			return res.status(403).json({ message: 'Solo veterinarias pueden registrar atenciones' });
		}
		if (me.status !== 'aprobado') {
			return res.status(403).json({ message: 'Tu perfil debe estar aprobado' });
		}

		const appt = await Appointment.findById(appointmentId).lean();
		if (!appt) return res.status(404).json({ message: 'Cita no encontrada' });
		if (appt.providerId.toString() !== req.user.id) {
			return res.status(403).json({ message: 'Esta cita no pertenece a tu clínica' });
		}
		if (!appt.petId || appt.petId.toString() !== petId) {
			return res.status(400).json({ message: 'La cita no corresponde a esta mascota' });
		}
		if (!['confirmed', 'completed'].includes(appt.status)) {
			return res.status(400).json({ message: 'La cita debe estar confirmada o completada para registrar atención' });
		}

		const duplicate = await ClinicalEncounter.exists({ appointmentId: appt._id });
		if (duplicate) {
			return res.status(409).json({ message: 'Ya existe un registro clínico para esta cita' });
		}

		const pet = await Pet.findById(petId).select('ownerId').lean();
		if (!pet) return res.status(404).json({ message: 'Mascota no encontrada' });

		const motivo = req.body?.motivo != null ? String(req.body.motivo).trim() : '';
		if (!motivo) return res.status(400).json({ message: 'motivo es obligatorio' });

		let medications = [];
		if (req.body?.medications != null) {
			const raw =
				typeof req.body.medications === 'string'
					? parseJsonField(req.body.medications, 'medications')
					: req.body.medications;
			if (Array.isArray(raw)) medications = raw;
		}

		let proximoControl;
		if (req.body?.proximoControl != null) {
			const raw =
				typeof req.body.proximoControl === 'string'
					? parseJsonField(req.body.proximoControl, 'proximoControl')
					: req.body.proximoControl;
			if (raw && typeof raw === 'object') {
				proximoControl = {
					fecha: raw.fecha ? new Date(raw.fecha) : undefined,
					motivo: raw.motivo != null ? String(raw.motivo).trim() : ''
				};
				if (proximoControl.fecha && Number.isNaN(proximoControl.fecha.getTime())) {
					return res.status(400).json({ message: 'proximoControl.fecha inválida' });
				}
			}
		}

		const attachments = [];
		const files = req.files || [];
		for (const f of files.slice(0, 3)) {
			attachments.push({
				path: path.join('clinical', f.filename).replace(/\\/g, '/'),
				originalName: f.originalname || f.filename
			});
		}

		const occurredAt = req.body?.occurredAt ? new Date(req.body.occurredAt) : new Date();
		if (Number.isNaN(occurredAt.getTime())) {
			return res.status(400).json({ message: 'occurredAt inválida' });
		}

		const enc = await ClinicalEncounter.create({
			petId,
			providerId: req.user.id,
			ownerId: pet.ownerId,
			appointmentId: appt._id,
			type: req.body?.type ? String(req.body.type).trim() : 'consulta',
			motivo,
			diagnostico: req.body?.diagnostico != null ? String(req.body.diagnostico).trim() : '',
			tratamiento: req.body?.tratamiento != null ? String(req.body.tratamiento).trim() : '',
			observaciones: req.body?.observaciones != null ? String(req.body.observaciones).trim() : '',
			occurredAt,
			medications,
			proximoControl,
			attachments
		});

		return res.status(201).json({
			message: 'Atención registrada',
			encounter: { id: String(enc._id) }
		});
	} catch (err) {
		if (err.code === 11000) {
			return res.status(409).json({ message: 'Ya existe un registro para esta cita' });
		}
		next(err);
	}
}

async function downloadVetEncounterAttachment(req, res, next) {
	try {
		const { petId, encounterId, index } = req.params;
		const ix = Number(index);
		if (!mongoose.isValidObjectId(petId) || !mongoose.isValidObjectId(encounterId)) {
			return res.status(400).json({ message: 'Id inválido' });
		}
		if (!Number.isInteger(ix) || ix < 0) {
			return res.status(400).json({ message: 'Índice inválido' });
		}

		const enc = await ClinicalEncounter.findOne({
			_id: encounterId,
			petId,
			providerId: req.user.id
		}).lean();

		if (!enc || !enc.attachments || !enc.attachments[ix]) {
			return res.status(404).json({ message: 'Adjunto no encontrado' });
		}

		const att = enc.attachments[ix];
		const full = resolveSafeUpload(att.path);
		if (!full || !fs.existsSync(full)) return res.status(404).end();

		res.setHeader(
			'Content-Disposition',
			`attachment; filename="${encodeURIComponent(att.originalName || path.basename(att.path))}"`
		);
		return res.sendFile(full);
	} catch (err) {
		next(err);
	}
}

module.exports = {
	listVetClinicalEncounters,
	getVetClinicalEncounterDetail,
	createClinicalEncounter,
	downloadVetEncounterAttachment
};
