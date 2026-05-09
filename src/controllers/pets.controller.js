'use strict';

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Pet = require('../models/Pet');
const User = require('../models/User');
const ClinicalEncounter = require('../models/ClinicalEncounter');
const { vetCanAccessPet } = require('../utils/vetPetAccess');

const uploadsRoot = path.join(__dirname, '..', 'uploads');

function resolveSafeUpload(relativePath) {
	if (!relativePath || typeof relativePath !== 'string') return null;
	const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
	const full = path.join(uploadsRoot, normalized);
	if (!full.startsWith(uploadsRoot)) return null;
	return full;
}

function formatPetPublic(doc) {
	const o = doc.ownerId && typeof doc.ownerId === 'object' ? doc.ownerId : null;
	return {
		_id: doc._id,
		id: doc._id,
		name: doc.name,
		species: doc.species,
		breed: doc.breed || '',
		birthDate: doc.birthDate,
		sex: doc.sex,
		color: doc.color || '',
		foto: doc.foto || null,
		status: doc.status,
		owner: o
			? {
					_id: o._id,
					name: o.name,
					lastName: o.lastName,
					email: o.email,
					phone: o.phone
				}
			: undefined
	};
}

async function assertOwnerPet(petId, ownerUserId) {
	const pet = await Pet.findById(petId).select('ownerId').lean();
	if (!pet) return { ok: false, code: 404, message: 'Mascota no encontrada' };
	if (pet.ownerId.toString() !== ownerUserId) {
		return { ok: false, code: 403, message: 'No autorizado' };
	}
	return { ok: true };
}

async function listMyPets(req, res, next) {
	try {
		const pets = await Pet.find({ ownerId: req.user.id }).sort({ createdAt: -1 }).lean();
		return res.status(200).json({
			pets: pets.map((p) => ({
				...p,
				id: p._id
			}))
		});
	} catch (err) {
		next(err);
	}
}

async function createPet(req, res, next) {
	try {
		const { name, species, breed, birthDate, sex, color } = req.body || {};
		if (!name || !species || !sex) {
			return res.status(400).json({ message: 'Campos obligatorios: name, species, sex' });
		}
		let fotoRel;
		if (req.file && req.file.filename) {
			fotoRel = path.join('pets', req.file.filename).replace(/\\/g, '/');
		}
		const pet = await Pet.create({
			ownerId: req.user.id,
			name: String(name).trim(),
			species: String(species).trim(),
			breed: breed != null ? String(breed).trim() : '',
			birthDate: birthDate ? new Date(birthDate) : undefined,
			sex: String(sex),
			color: color != null ? String(color).trim() : '',
			foto: fotoRel
		});
		const populated = await Pet.findById(pet._id).populate('ownerId', 'name lastName email').lean();
		return res.status(201).json({ pet: formatPetPublic(populated) });
	} catch (err) {
		next(err);
	}
}

async function getPet(req, res, next) {
	try {
		const { petId } = req.params;
		if (!mongoose.isValidObjectId(petId)) {
			return res.status(400).json({ message: 'petId inválido' });
		}
		const pet = await Pet.findById(petId).populate('ownerId', 'name lastName email phone').lean();
		if (!pet) return res.status(404).json({ message: 'Mascota no encontrada' });

		if (req.user.role === 'dueno') {
			if (pet.ownerId._id.toString() !== req.user.id) {
				return res.status(403).json({ message: 'No autorizado' });
			}
		} else if (req.user.role === 'proveedor') {
			const me = await User.findById(req.user.id).select('providerType').lean();
			if (!me || me.providerType !== 'veterinaria') {
				return res.status(403).json({ message: 'No autorizado' });
			}
			const ok = await vetCanAccessPet(req.user.id, petId);
			if (!ok) return res.status(403).json({ message: 'No tienes citas agendadas con esta mascota' });
		} else {
			return res.status(403).json({ message: 'No autorizado' });
		}

		return res.status(200).json({ pet: formatPetPublic(pet) });
	} catch (err) {
		next(err);
	}
}

async function updatePet(req, res, next) {
	try {
		const { petId } = req.params;
		const gate = await assertOwnerPet(petId, req.user.id);
		if (!gate.ok) return res.status(gate.code).json({ message: gate.message });

		const { name, species, breed, birthDate, sex, color } = req.body || {};
		const $set = {};
		if (name !== undefined) $set.name = String(name).trim();
		if (species !== undefined) $set.species = String(species).trim();
		if (breed !== undefined) $set.breed = String(breed).trim();
		if (birthDate !== undefined) $set.birthDate = birthDate ? new Date(birthDate) : null;
		if (sex !== undefined) $set.sex = String(sex);
		if (color !== undefined) $set.color = String(color).trim();

		if (req.file && req.file.filename) {
			$set.foto = path.join('pets', req.file.filename).replace(/\\/g, '/');
		}

		await Pet.updateOne({ _id: petId }, { $set });
		const populated = await Pet.findById(petId).populate('ownerId', 'name lastName email').lean();
		return res.status(200).json({ pet: formatPetPublic(populated) });
	} catch (err) {
		next(err);
	}
}

async function getPetPhoto(req, res, next) {
	try {
		const { petId } = req.params;
		if (!mongoose.isValidObjectId(petId)) {
			return res.status(400).json({ message: 'petId inválido' });
		}
		const pet = await Pet.findById(petId).select('ownerId foto').lean();
		if (!pet || !pet.foto) return res.status(404).end();

		if (req.user.role === 'dueno') {
			if (pet.ownerId.toString() !== req.user.id) return res.status(403).end();
		} else if (req.user.role === 'proveedor') {
			const me = await User.findById(req.user.id).select('providerType').lean();
			if (!me || me.providerType !== 'veterinaria') return res.status(403).end();
			const ok = await vetCanAccessPet(req.user.id, petId);
			if (!ok) return res.status(403).end();
		} else {
			return res.status(403).end();
		}

		const full = resolveSafeUpload(pet.foto);
		if (!full || !fs.existsSync(full)) return res.status(404).end();
		return res.sendFile(full);
	} catch (err) {
		next(err);
	}
}

async function getMedicalSummary(req, res, next) {
	try {
		const { petId } = req.params;
		const gate = await assertOwnerPet(petId, req.user.id);
		if (!gate.ok) return res.status(gate.code).json({ message: gate.message });

		const pet = await Pet.findById(petId).lean();
		const encounters = await ClinicalEncounter.find({ petId })
			.sort({ occurredAt: -1 })
			.select('occurredAt')
			.lean();

		const totalEncounters = encounters.length;
		const lastVisitAt = encounters.length ? encounters[0].occurredAt : null;

		return res.status(200).json({
			pet: {
				_id: pet._id,
				name: pet.name,
				species: pet.species,
				status: pet.status
			},
			summary: {
				totalEncounters,
				lastVisitAt
			}
		});
	} catch (err) {
		next(err);
	}
}

async function listOwnerClinicalEncounters(req, res, next) {
	try {
		const { petId } = req.params;
		const gate = await assertOwnerPet(petId, req.user.id);
		if (!gate.ok) return res.status(gate.code).json({ message: gate.message });

		const encs = await ClinicalEncounter.find({ petId })
			.sort({ occurredAt: -1 })
			.populate('providerId', 'name lastName')
			.lean();

		const encounters = encs.map((e) => {
			const pr = e.providerId;
			const vn = pr ? `${pr.name || ''} ${pr.lastName || ''}`.trim() : '';
			return {
				id: String(e._id),
				type: e.type,
				motivo: e.motivo,
				occurredAt: e.occurredAt,
				veterinaria: vn || '—'
			};
		});

		return res.status(200).json({ encounters });
	} catch (err) {
		next(err);
	}
}

async function getClinicalEncounterDetail(req, res, next) {
	try {
		const { petId, encounterId } = req.params;
		const gate = await assertOwnerPet(petId, req.user.id);
		if (!gate.ok) return res.status(gate.code).json({ message: gate.message });

		const enc = await ClinicalEncounter.findOne({ _id: encounterId, petId })
			.populate('providerId', 'name lastName email')
			.lean();
		if (!enc) return res.status(404).json({ message: 'Atención no encontrada' });

		const pr = enc.providerId;
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
			attachments: (enc.attachments || []).map((a, i) => ({
				index: i,
				name: a.originalName || `adjunto-${i + 1}`
			})),
			veterinaria: pr ? `${pr.name || ''} ${pr.lastName || ''}`.trim() : ''
		};

		return res.status(200).json({ encounter });
	} catch (err) {
		next(err);
	}
}

async function downloadEncounterAttachment(req, res, next) {
	try {
		const { petId, encounterId, index } = req.params;
		const ix = Number(index);
		if (!Number.isInteger(ix) || ix < 0) {
			return res.status(400).json({ message: 'Índice inválido' });
		}

		const gate = await assertOwnerPet(petId, req.user.id);
		if (!gate.ok) return res.status(gate.code).json({ message: gate.message });

		const enc = await ClinicalEncounter.findOne({ _id: encounterId, petId }).lean();
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

async function exportMedicalPdf(req, res) {
	return res.status(501).json({ message: 'Exportación PDF aún no está disponible en el servidor' });
}

async function markPetDeceased(req, res, next) {
	try {
		const { petId } = req.params;
		const gate = await assertOwnerPet(petId, req.user.id);
		if (!gate.ok) return res.status(gate.code).json({ message: gate.message });

		await Pet.updateOne({ _id: petId }, { status: 'deceased' });
		const populated = await Pet.findById(petId).populate('ownerId', 'name lastName email').lean();
		return res.status(200).json({ pet: formatPetPublic(populated) });
	} catch (err) {
		next(err);
	}
}

module.exports = {
	listMyPets,
	createPet,
	getPet,
	updatePet,
	getPetPhoto,
	getMedicalSummary,
	listOwnerClinicalEncounters,
	getClinicalEncounterDetail,
	downloadEncounterAttachment,
	exportMedicalPdf,
	markPetDeceased
};
