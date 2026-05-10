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
	deleteMySlot,
	clearOmittedAgendaSlots
} = require('../controllers/providerAgenda.controller');

router.use(auth, authorizeRoles('proveedor'));

// Genera bloques de 30 min según agendaSlotStart/End del perfil (zona AGENDA_TIMEZONE, p. ej. America/Santiago)
router.post('/generate', generateAgendaSlots);

// Lista bloques del proveedor autenticado
router.get('/slots', listMySlots);

// Olvida franjas "eliminadas a mano" (para que "generar" vuelva a ofrecerlas)
router.delete('/omits', clearOmittedAgendaSlots);

// Bloquea/desbloquea disponibilidad puntual
router.patch('/slots/:slotId/block', blockMySlot);
router.patch('/slots/:slotId/unblock', unblockMySlot);

// Elimina un bloque
router.delete('/slots/:slotId', deleteMySlot);

module.exports = router;
