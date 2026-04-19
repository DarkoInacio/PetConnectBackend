'use strict';

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Pet = require('../models/Pet');
const ClinicalEncounter = require('../models/ClinicalEncounter');
const User = require('../models/User');
const { findPetForOwner, vetHasAccessToPet } = require('../services/petAccess.service');
const { processPetImageBufferToJpeg, PET_UPLOAD_SUBDIR } = require('../utils/processPetImage');
const { streamMedicalRecordPdf } = require('../services/medicalPdf.service');

const MAX_ACTIVE_PETS = 10;
const uploadsRoot = path.join(__dirname, '..', 'uploads');
const petsDir = path.join(uploadsRoot, 'pets');
const clinicalDir = path.join(uploadsRoot, 'clinical');

function ownerIdString(pet) {
	const o = pet.ownerId;
	if (!o) return null;
	return o._id ? String(o._id) : String(o);
}

async function countActivePets(ownerId) {
	return Pet.countDocuments({ ownerId, status: 'active' });
}

async function createPet(req, res, next) {
	try {
		const active = await countActivePets(req.user.id);
		if (active >= MAX_ACTIVE_PETS) {
			return res.status(400).json({ message: `Maximo ${MAX_ACTIVE_PETS} mascotas activas permitidas` });
		}

		const { name, species, breed, birthDate, sex, color } = req.body || {};
		if (!name || !species || !sex) {
			return res.status(400).json({ message: 'Campos obligatorios: name, species, sex' });
		}
		if (!Pet.PET_SPECIES.includes(species)) {
			return res.status(400).json({ message: `species invalida. Valores: ${Pet.PET_SPECIES.join(', ')}` });
		}
		if (!Pet.PET_SEX.includes(sex)) {
			return res.status(400).json({ message: `sex invalido. Valores: ${Pet.PET_SEX.join(', ')}` });
		}

		let birth = null;
		if (birthDate != null && String(birthDate).trim()) {
			birth = new Date(birthDate);
			if (Number.isNaN(birth.getTime())) {
				return res.status(400).json({ message: 'birthDate invalida' });
			}
		}

		const pet = await Pet.create({
			ownerId: req.user.id,
			name: String(name).trim(),
			species,
			breed: breed != null ? String(breed).trim() : '',
			birthDate: birth,
			sex,
			color: color != null ? String(color).trim() : '',
			status: 'active'
		});

		if (req.file && req.file.buffer) {
			const rel = await processPetImageBufferToJpeg(req.file.buffer, petsDir, `pet-${pet._id}`);
			pet.photoFilename = rel;
			await pet.save();
		}

		const fresh = await Pet.findById(pet._id).lean();
		return res.status(201).json({ pet: fresh });
	} catch (err) {
		next(err);
	}
}

async function listPets(req, res, next) {
	try {
		const forAgenda = String(req.query.forAgenda || '') === '1' || String(req.query.forAgenda || '') === 'true';
		const filter = { ownerId: req.user.id };
		if (forAgenda) {
			filter.status = 'active';
		}
		const pets = await Pet.find(filter).sort({ createdAt: -1 }).lean();
		return res.status(200).json({ pets });
	} catch (err) {
		next(err);
	}
}

async function getPet(req, res, next) {
	try {
		const pet = await Pet.findById(req.params.petId).populate('ownerId', 'name lastName email phone').lean();
		if (!pet) {
			return res.status(404).json({ message: 'Mascota no encontrada' });
		}
		const isOwner = String(pet.ownerId._id || pet.ownerId) === req.user.id;
		let isVet = false;
		if (req.user.role === 'proveedor') {
			isVet = await vetHasAccessToPet(req.user.id, pet._id);
		}
		if (!isOwner && !isVet) {
			return res.status(403).json({ message: 'No autorizado' });
		}
		return res.status(200).json({ pet });
	} catch (err) {
		next(err);
	}
}

async function updatePet(req, res, next) {
	try {
		const pet = await Pet.findById(req.params.petId);
		if (!pet || ownerIdString(pet) !== req.user.id) {
			return res.status(404).json({ message: 'Mascota no encontrada' });
		}
		if (pet.status === 'deceased') {
			return res.status(400).json({ message: 'La ficha esta en estado fallecida; no se puede editar' });
		}

		const { name, species, breed, birthDate, sex, color } = req.body || {};
		if (name !== undefined) pet.name = String(name).trim();
		if (species !== undefined) {
			if (!Pet.PET_SPECIES.includes(species)) {
				return res.status(400).json({ message: `species invalida` });
			}
			pet.species = species;
		}
		if (breed !== undefined) pet.breed = String(breed).trim();
		if (birthDate !== undefined) {
			if (birthDate === null || !String(birthDate).trim()) {
				pet.birthDate = null;
			} else {
				const b = new Date(birthDate);
				if (Number.isNaN(b.getTime())) {
					return res.status(400).json({ message: 'birthDate invalida' });
				}
				pet.birthDate = b;
			}
		}
		if (sex !== undefined) {
			if (!Pet.PET_SEX.includes(sex)) {
				return res.status(400).json({ message: 'sex invalido' });
			}
			pet.sex = sex;
		}
		if (color !== undefined) pet.color = String(color).trim();

		if (!pet.name || !pet.species || !pet.sex) {
			return res.status(400).json({ message: 'name, species y sex son obligatorios' });
		}

		if (req.file && req.file.buffer) {
			const rel = await processPetImageBufferToJpeg(req.file.buffer, petsDir, `pet-${pet._id}`);
			if (pet.photoFilename) {
				const oldAbs = path.join(uploadsRoot, pet.photoFilename);
				if (fs.existsSync(oldAbs)) {
					fs.unlinkSync(oldAbs);
				}
			}
			pet.photoFilename = rel;
		}

		await pet.save();
		const fresh = await Pet.findById(pet._id).lean();
		return res.status(200).json({ message: 'Mascota actualizada', pet: fresh });
	} catch (err) {
		next(err);
	}
}

async function markPetDeceased(req, res, next) {
	try {
		const pet = await Pet.findById(req.params.petId);
		if (!pet || ownerIdString(pet) !== req.user.id) {
			return res.status(404).json({ message: 'Mascota no encontrada' });
		}
		if (pet.status === 'deceased') {
			return res.status(400).json({ message: 'La mascota ya figura como fallecida' });
		}
		pet.status = 'deceased';
		pet.deceasedAt = new Date();
		await pet.save();
		return res.status(200).json({ message: 'Ficha marcada como fallecida', pet: await Pet.findById(pet._id).lean() });
	} catch (err) {
		next(err);
	}
}

async function getPetPhoto(req, res, next) {
	try {
		const pet = await Pet.findById(req.params.petId).lean();
		if (!pet || !pet.photoFilename) {
			return res.status(404).json({ message: 'Sin foto' });
		}
		const isOwner = String(pet.ownerId) === req.user.id;
		let isVet = false;
		if (req.user.role === 'proveedor') {
			isVet = await vetHasAccessToPet(req.user.id, pet._id);
		}
		if (!isOwner && !isVet) {
			return res.status(403).json({ message: 'No autorizado' });
		}
		const abs = path.join(uploadsRoot, pet.photoFilename);
		if (!fs.existsSync(abs)) {
			return res.status(404).json({ message: 'Archivo no encontrado' });
		}
		res.setHeader('Content-Type', 'image/jpeg');
		res.setHeader('Cache-Control', 'private, no-store');
		return fs.createReadStream(abs).pipe(res);
	} catch (err) {
		next(err);
	}
}

async function getMedicalSummary(req, res, next) {
	try {
		const pet = await Pet.findById(req.params.petId).lean();
		if (!pet) {
			return res.status(404).json({ message: 'Mascota no encontrada' });
		}
		const isOwner = String(pet.ownerId) === req.user.id;
		let isVet = false;
		if (req.user.role === 'proveedor') {
			isVet = await vetHasAccessToPet(req.user.id, pet._id);
		}
		if (!isOwner && !isVet) {
			return res.status(403).json({ message: 'No autorizado' });
		}

		const [count, last] = await Promise.all([
			ClinicalEncounter.countDocuments({ petId: pet._id }),
			ClinicalEncounter.findOne({ petId: pet._id }).sort({ occurredAt: -1 }).select('occurredAt').lean()
		]);

		return res.status(200).json({
			pet: {
				id: pet._id,
				name: pet.name,
				species: pet.species,
				breed: pet.breed,
				birthDate: pet.birthDate,
				sex: pet.sex,
				color: pet.color,
				status: pet.status,
				hasPhoto: Boolean(pet.photoFilename)
			},
			summary: {
				totalEncounters: count,
				lastVisitAt: last ? last.occurredAt : null
			}
		});
	} catch (err) {
		next(err);
	}
}

async function listClinicalEncounters(req, res, next) {
	try {
		const { petId } = req.params;
		const pet = await Pet.findById(petId).lean();
		if (!pet) {
			return res.status(404).json({ message: 'Mascota no encontrada' });
		}
		const isOwner = String(pet.ownerId) === req.user.id;
		let isVet = false;
		if (req.user.role === 'proveedor') {
			isVet = await vetHasAccessToPet(req.user.id, petId);
		}
		if (!isOwner && !isVet) {
			return res.status(403).json({ message: 'No autorizado' });
		}

		const filter = { petId };
		if (req.query.providerId && mongoose.isValidObjectId(req.query.providerId)) {
			filter.providerId = req.query.providerId;
		}
		if (req.query.type && ClinicalEncounter.ENCOUNTER_TYPES.includes(req.query.type)) {
			filter.type = req.query.type;
		}
		if (req.query.from || req.query.to) {
			filter.occurredAt = {};
			if (req.query.from) {
				const d = new Date(req.query.from);
				if (Number.isNaN(d.getTime())) {
					return res.status(400).json({ message: 'from invalido' });
				}
				filter.occurredAt.$gte = d;
			}
			if (req.query.to) {
				const d = new Date(req.query.to);
				if (Number.isNaN(d.getTime())) {
					return res.status(400).json({ message: 'to invalido' });
				}
				filter.occurredAt.$lte = d;
			}
		}

		const encounters = await ClinicalEncounter.find(filter)
			.sort({ occurredAt: -1 })
			.populate('providerId', 'name lastName email')
			.lean();

		const items = encounters.map((e) => ({
			id: e._id,
			type: e.type,
			occurredAt: e.occurredAt,
			motivo: e.motivo,
			diagnosticoResumen: (e.diagnostico || '').slice(0, 160),
			veterinaria: e.providerId
				? `${e.providerId.name || ''} ${e.providerId.lastName || ''}`.trim()
				: '',
			attachmentCount: (e.attachments || []).length
		}));

		return res.status(200).json({ encounters: items });
	} catch (err) {
		next(err);
	}
}

async function getClinicalEncounterDetail(req, res, next) {
	try {
		const { petId, encounterId } = req.params;
		const pet = await Pet.findById(petId).lean();
		if (!pet) {
			return res.status(404).json({ message: 'Mascota no encontrada' });
		}
		const isOwner = String(pet.ownerId) === req.user.id;
		let isVet = false;
		if (req.user.role === 'proveedor') {
			isVet = await vetHasAccessToPet(req.user.id, petId);
		}
		if (!isOwner && !isVet) {
			return res.status(403).json({ message: 'No autorizado' });
		}

		const enc = await ClinicalEncounter.findOne({ _id: encounterId, petId })
			.populate('providerId', 'name lastName email')
			.lean();
		if (!enc) {
			return res.status(404).json({ message: 'Atencion no encontrada' });
		}

		return res.status(200).json({ encounter: enc });
	} catch (err) {
		next(err);
	}
}

async function downloadEncounterAttachment(req, res, next) {
	try {
		const { petId, encounterId, index } = req.params;
		const idx = Number(index);
		if (!Number.isInteger(idx) || idx < 0) {
			return res.status(400).json({ message: 'Indice invalido' });
		}

		const pet = await Pet.findById(petId).lean();
		if (!pet) {
			return res.status(404).json({ message: 'Mascota no encontrada' });
		}
		const isOwner = String(pet.ownerId) === req.user.id;
		let isVet = false;
		if (req.user.role === 'proveedor') {
			isVet = await vetHasAccessToPet(req.user.id, petId);
		}
		if (!isOwner && !isVet) {
			return res.status(403).json({ message: 'No autorizado' });
		}

		const enc = await ClinicalEncounter.findOne({ _id: encounterId, petId }).lean();
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
		res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.originalName || 'adjunto')}"`);
		res.setHeader('Cache-Control', 'private, no-store');
		return fs.createReadStream(abs).pipe(res);
	} catch (err) {
		next(err);
	}
}

async function exportMedicalPdf(req, res, next) {
	try {
		await streamMedicalRecordPdf(res, {
			petId: req.params.petId,
			requesterId: req.user.id,
			requesterRole: req.user.role,
			requesterEmail: req.user.email
		});
	} catch (err) {
		if (err.status) {
			return res.status(err.status).json({ message: err.message });
		}
		next(err);
	}
}

module.exports = {
	createPet,
	listPets,
	getPet,
	updatePet,
	markPetDeceased,
	getPetPhoto,
	getMedicalSummary,
	listClinicalEncounters,
	getClinicalEncounterDetail,
	downloadEncounterAttachment,
	exportMedicalPdf
};
