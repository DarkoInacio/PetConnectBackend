'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const { uploadPetPhoto } = require('../config/multer');
const {
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
} = require('../controllers/pets.controller');

router.get('/', auth, authorizeRoles('dueno'), listMyPets);
router.post('/', auth, authorizeRoles('dueno'), uploadPetPhoto.single('foto'), createPet);

router.get('/:petId/medical-summary', auth, authorizeRoles('dueno'), getMedicalSummary);
router.get(
	'/:petId/clinical-encounters/:encounterId/attachments/:index',
	auth,
	authorizeRoles('dueno'),
	downloadEncounterAttachment
);
router.get('/:petId/clinical-encounters/:encounterId', auth, authorizeRoles('dueno'), getClinicalEncounterDetail);
router.get('/:petId/clinical-encounters', auth, authorizeRoles('dueno'), listOwnerClinicalEncounters);
router.get('/:petId/medical-record/export.pdf', auth, authorizeRoles('dueno'), exportMedicalPdf);
router.patch('/:petId/mark-deceased', auth, authorizeRoles('dueno'), markPetDeceased);
router.get('/:petId/photo', auth, getPetPhoto);
router.patch('/:petId', auth, authorizeRoles('dueno'), uploadPetPhoto.single('foto'), updatePet);
router.get('/:petId', auth, getPet);

module.exports = router;
