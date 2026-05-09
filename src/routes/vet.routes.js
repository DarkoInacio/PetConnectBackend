'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const ensureVeterinariaProvider = require('../middlewares/ensureVeterinariaProvider');
const { uploadClinicalFiles } = require('../config/multer');
const { listVetPatients } = require('../controllers/vetPatients.controller');
const {
	listVetClinicalEncounters,
	getVetClinicalEncounterDetail,
	createClinicalEncounter,
	downloadVetEncounterAttachment
} = require('../controllers/vetClinical.controller');

router.get('/patients', auth, authorizeRoles('proveedor'), ensureVeterinariaProvider, listVetPatients);

router.get(
	'/pets/:petId/clinical-encounters/:encounterId/attachments/:index',
	auth,
	authorizeRoles('proveedor'),
	ensureVeterinariaProvider,
	downloadVetEncounterAttachment
);

router.get(
	'/pets/:petId/clinical-encounters/:encounterId',
	auth,
	authorizeRoles('proveedor'),
	ensureVeterinariaProvider,
	getVetClinicalEncounterDetail
);

router.get(
	'/pets/:petId/clinical-encounters',
	auth,
	authorizeRoles('proveedor'),
	ensureVeterinariaProvider,
	listVetClinicalEncounters
);

router.post(
	'/pets/:petId/clinical-encounters',
	auth,
	authorizeRoles('proveedor'),
	ensureVeterinariaProvider,
	uploadClinicalFiles.array('attachments', 3),
	createClinicalEncounter
);

module.exports = router;
