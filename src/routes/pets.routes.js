'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const { uploadPetPhotoMemory } = require('../config/multerPetPhoto');
const {
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
} = require('../controllers/pets.controller');

router.post('/', auth, authorizeRoles('dueno'), uploadPetPhotoMemory.single('foto'), createPet);
router.get('/', auth, authorizeRoles('dueno'), listPets);

router.get('/:petId/medical-record/export.pdf', auth, exportMedicalPdf);
router.get('/:petId/medical-summary', auth, getMedicalSummary);
router.get('/:petId/clinical-encounters', auth, listClinicalEncounters);
router.get('/:petId/clinical-encounters/:encounterId/attachments/:index', auth, downloadEncounterAttachment);
router.get('/:petId/clinical-encounters/:encounterId', auth, getClinicalEncounterDetail);

router.get('/:petId/photo', auth, getPetPhoto);
router.patch('/:petId/mark-deceased', auth, authorizeRoles('dueno'), markPetDeceased);
router.patch('/:petId', auth, authorizeRoles('dueno'), uploadPetPhotoMemory.single('foto'), updatePet);
router.get('/:petId', auth, getPet);

module.exports = router;
