'use strict';

const mongoose = require('mongoose');
const Cita = require('../models/Cita');
const User = require('../models/User');

/**
 * POST /api/citas
 */
async function createCita(req, res, next) {
	try {
		const { proveedorId, mascota, servicio, fecha, notas } = req.body || {};

		if (!proveedorId || !mascota || !servicio || !fecha) {
			return res.status(400).json({
				message: 'Campos obligatorios: proveedorId, mascota (nombre y especie), servicio, fecha'
			});
		}

		if (!mongoose.isValidObjectId(proveedorId)) {
			return res.status(400).json({ message: 'proveedorId inválido' });
		}

		if (typeof mascota !== 'object' || !mascota.nombre || !mascota.especie) {
			return res.status(400).json({ message: 'mascota debe incluir nombre y especie' });
		}

		const fechaCita = new Date(fecha);
		if (Number.isNaN(fechaCita.getTime())) {
			return res.status(400).json({ message: 'fecha inválida' });
		}

		const prov = await User.findById(proveedorId).select('role status name lastName email');
		if (!prov || prov.role !== 'proveedor' || prov.status !== 'aprobado') {
			return res.status(400).json({ message: 'El proveedor no existe o no está aprobado' });
		}

		const cita = await Cita.create({
			dueno: req.user.id,
			proveedor: proveedorId,
			mascota: {
				nombre: String(mascota.nombre).trim(),
				especie: String(mascota.especie).trim()
			},
			servicio: String(servicio).trim(),
			fecha: fechaCita,
			notas: notas != null && String(notas).trim() ? String(notas).trim() : undefined,
			estado: 'pendiente'
		});

		const populated = await Cita.findById(cita._id)
			.populate('proveedor', 'name lastName email providerType')
			.populate('dueno', 'name lastName email');

		return res.status(201).json({ cita: populated });
	} catch (err) {
		next(err);
	}
}

module.exports = {
	createCita
};
