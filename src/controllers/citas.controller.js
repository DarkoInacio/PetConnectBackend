'use strict';

const mongoose = require('mongoose');
const Cita = require('../models/Cita');
const User = require('../models/User');
const CITA_ESTADOS = Cita.CITA_ESTADOS;

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

/**
 * GET /api/citas/mis-citas
 */
async function getMisCitas(req, res, next) {
	try {
		const q = req.query;
		const filter = { dueno: req.user.id };

		if (q.mascota !== undefined && String(q.mascota).trim()) {
			const esc = String(q.mascota).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			filter['mascota.nombre'] = new RegExp(esc, 'i');
		}

		if (q.fechaDesde !== undefined && String(q.fechaDesde).trim()) {
			const d = new Date(q.fechaDesde);
			if (Number.isNaN(d.getTime())) {
				return res.status(400).json({ message: 'fechaDesde inválida' });
			}
			filter.fecha = filter.fecha || {};
			filter.fecha.$gte = d;
		}

		if (q.fechaHasta !== undefined && String(q.fechaHasta).trim()) {
			const d = new Date(q.fechaHasta);
			if (Number.isNaN(d.getTime())) {
				return res.status(400).json({ message: 'fechaHasta inválida' });
			}
			filter.fecha = filter.fecha || {};
			filter.fecha.$lte = d;
		}

		if (q.estado !== undefined && String(q.estado).trim()) {
			const e = String(q.estado).trim();
			if (!CITA_ESTADOS.includes(e)) {
				return res.status(400).json({ message: `estado debe ser uno de: ${CITA_ESTADOS.join(', ')}` });
			}
			filter.estado = e;
		}

		const citas = await Cita.find(filter)
			.populate('proveedor', 'name lastName email providerType')
			.sort({ fecha: -1 })
			.lean();

		return res.status(200).json({ citas });
	} catch (err) {
		next(err);
	}
}

/**
 * GET /api/citas/proximas
 */
async function getProximasCitas(req, res, next) {
	try {
		const start = new Date();
		start.setHours(0, 0, 0, 0);

		const citas = await Cita.find({
			dueno: req.user.id,
			fecha: { $gte: start },
			estado: { $in: ['pendiente', 'confirmada'] }
		})
			.populate('proveedor', 'name lastName email providerType')
			.sort({ fecha: 1 })
			.lean();

		return res.status(200).json({ citas });
	} catch (err) {
		next(err);
	}
}

module.exports = {
	createCita,
	getMisCitas,
	getProximasCitas
};
