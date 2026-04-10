'use strict';

const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/roles');
const {
	generateAgendaSlots,
	listMySlots,
	blockMySlot,
	unblockMySlot,
	deleteMySlot
} = require('../controllers/providerAgenda.controller');

router.use(auth, authorizeRoles('proveedor'));

// Genera bloques de agenda de 09:00 a 18:00 cada 30 minutos
router.post('/generate', generateAgendaSlots);

// Lista bloques del proveedor autenticado
router.get('/slots', listMySlots);

// Bloquea/desbloquea disponibilidad puntual
router.patch('/slots/:slotId/block', blockMySlot);
router.patch('/slots/:slotId/unblock', unblockMySlot);

// Elimina un bloque
router.delete('/slots/:slotId', deleteMySlot);

module.exports = router;
