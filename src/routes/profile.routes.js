'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { upload } = require('../config/multer');
const { getMyProfile, updateMyProfile } = require('../controllers/profile.controller');

// Mis datos
router.get('/me', auth, getMyProfile);

// Editar perfil (con foto opcional)
router.put('/me', auth, upload.single('profileImage'), updateMyProfile);

module.exports = router;