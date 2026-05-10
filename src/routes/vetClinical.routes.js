'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const requireVeterinarian = require('../middlewares/requireVeterinarian');
const { uploadClinicalAttachments } = require('../config/multerMedical');
const { listVetPatients } = require('../controllers/vetPatients.controller');
const {
	createClinicalEncounter,
	updateClinicalEncounter,
	addRetractionComment,
	listVetClinicalEncounters,
	getVetClinicalEncounterDetail,
	downloadVetEncounterAttachment
} = require('../controllers/vetClinical.controller');

const uploadAttachments = uploadClinicalAttachments.array('attachments', 3);

function maybeUploadAttachments(req, res, next) {
	const ct = req.headers['content-type'] || '';
	if (ct.includes('multipart/form-data')) {
		return uploadAttachments(req, res, next);
	}
	return next();
}

router.get('/patients', auth, requireVeterinarian, listVetPatients);

router.get(
	'/pets/:petId/clinical-encounters/:encounterId/attachments/:index',
	auth,
	requireVeterinarian,
	downloadVetEncounterAttachment
);
router.get(
	'/pets/:petId/clinical-encounters/:encounterId',
	auth,
	requireVeterinarian,
	getVetClinicalEncounterDetail
);
router.get('/pets/:petId/clinical-encounters', auth, requireVeterinarian, listVetClinicalEncounters);

router.post('/pets/:petId/clinical-encounters', auth, requireVeterinarian, uploadAttachments, createClinicalEncounter);

router.patch('/clinical-encounters/:encounterId', auth, requireVeterinarian, maybeUploadAttachments, updateClinicalEncounter);

router.post('/clinical-encounters/:encounterId/retractions', auth, requireVeterinarian, addRetractionComment);

module.exports = router;
