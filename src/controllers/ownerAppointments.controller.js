'use strict';

const mongoose = require('mongoose');
const Cita = require('../models/Cita');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const CITA_ESTADOS = Cita.CITA_ESTADOS;
const {
	notifyProviderAppointmentCanceled,
	notifyProviderAppointmentRescheduled
} = require('../utils/notifyProviderAppointment');
const { isProveedorAprobado } = require('../utils/providerEligibility');

function mapCitaEstadoToAppointmentStatus(estado) {
	switch (estado) {
		case 'pendiente':
			return 'pending_confirmation';
		case 'confirmada':
			return 'confirmed';
		case 'cancelada':
			return 'cancelled_by_owner';
		case 'completada':
			return 'completed';
		default:
			return 'pending_confirmation';
	}
}

/**
 * POST /api/citas
 */
async function createOwnerAppointment(req, res, next) {
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
		if (!prov || !isProveedorAprobado(prov)) {
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

		try {
			await Appointment.create({
				ownerId: req.user.id,
				providerId: proveedorId,
				bookingSource: 'legacy_cita',
				legacyCitaId: cita._id,
				startAt: fechaCita,
				endAt: new Date(fechaCita.getTime() + 60 * 60 * 1000),
				pet: {
					name: String(mascota.nombre).trim(),
					species: String(mascota.especie).trim()
				},
				reason: String(servicio).trim(),
				status: mapCitaEstadoToAppointmentStatus('pendiente')
			});
		} catch (dupErr) {
			console.error('[HU-14] Dual-write Cita→Appointment:', dupErr.message);
		}

		res.set(
			'X-PetConnect-Booking-Note',
			'Fuente canónica: colección Appointment. Esta ruta duplica en Appointment (legacy_cita). Preferir POST /api/appointments con slotId.'
		);

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
async function listMyAppointments(req, res, next) {
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
async function listUpcomingAppointments(req, res, next) {
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

function duenoIdString(citaDoc) {
	const d = citaDoc.dueno;
	if (!d) return null;
	return d._id ? d._id.toString() : d.toString();
}

function proveedorIdString(citaDoc) {
	const p = citaDoc.proveedor;
	if (!p) return null;
	return p._id ? p._id.toString() : p.toString();
}

/**
 * PATCH /api/citas/:id/cancelar
 */
async function cancelAppointment(req, res, next) {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id)) {
			return res.status(400).json({ message: 'Id de cita inválido' });
		}

		const cita = await Cita.findById(id)
			.populate('proveedor', 'email name lastName')
			.populate('dueno', 'name lastName email');

		if (!cita) {
			return res.status(404).json({ message: 'Cita no encontrada' });
		}

		if (duenoIdString(cita) !== req.user.id) {
			return res.status(403).json({ message: 'Solo el dueño puede cancelar esta cita' });
		}

		if (!['pendiente', 'confirmada'].includes(cita.estado)) {
			return res.status(400).json({ message: 'Solo se pueden cancelar citas pendientes o confirmadas' });
		}

		cita.estado = 'cancelada';
		await cita.save();

		await Appointment.updateMany(
			{ legacyCitaId: cita._id },
			{
				$set: {
					status: 'cancelled_by_owner',
					cancelledAt: new Date(),
					cancellationReason: 'Cancelada vía /api/citas'
				}
			}
		).catch((e) => console.error('[HU-14] sync cancel Appointment:', e.message));

		const prov = cita.proveedor;
		const provNombre = prov ? `${prov.name || ''} ${prov.lastName || ''}`.trim() || 'Proveedor' : 'Proveedor';
		notifyProviderAppointmentCanceled({
			providerEmail: prov?.email,
			providerName: provNombre,
			ownerDoc: cita.dueno,
			cita
		}).catch((err) => console.error('notifyProviderAppointmentCanceled:', err.message));

		const updated = await Cita.findById(cita._id)
			.populate('proveedor', 'name lastName email providerType')
			.populate('dueno', 'name lastName email');

		return res.status(200).json({ message: 'Cita cancelada', cita: updated });
	} catch (err) {
		next(err);
	}
}

/**
 * PATCH /api/citas/:id/reagendar
 */
async function rescheduleAppointment(req, res, next) {
	try {
		const { id } = req.params;
		const { fecha } = req.body || {};

		if (!mongoose.isValidObjectId(id)) {
			return res.status(400).json({ message: 'Id de cita inválido' });
		}
		if (fecha === undefined || fecha === null || !String(fecha).trim()) {
			return res.status(400).json({ message: 'fecha es obligatoria' });
		}

		const nuevaFecha = new Date(fecha);
		if (Number.isNaN(nuevaFecha.getTime())) {
			return res.status(400).json({ message: 'fecha inválida' });
		}

		const cita = await Cita.findById(id)
			.populate('proveedor', 'email name lastName')
			.populate('dueno', 'name lastName email');

		if (!cita) {
			return res.status(404).json({ message: 'Cita no encontrada' });
		}

		if (duenoIdString(cita) !== req.user.id) {
			return res.status(403).json({ message: 'Solo el dueño puede reagendar esta cita' });
		}

		if (!['pendiente', 'confirmada'].includes(cita.estado)) {
			return res.status(400).json({ message: 'Solo se pueden reagendar citas pendientes o confirmadas' });
		}

		const fechaAnterior = cita.fecha;
		cita.fecha = nuevaFecha;
		await cita.save();

		await Appointment.updateMany(
			{ legacyCitaId: cita._id },
			{
				$set: {
					startAt: nuevaFecha,
					endAt: new Date(nuevaFecha.getTime() + 60 * 60 * 1000)
				}
			}
		).catch((e) => console.error('[HU-14] sync reagendar Appointment:', e.message));

		const prov = cita.proveedor;
		const provNombre = prov ? `${prov.name || ''} ${prov.lastName || ''}`.trim() || 'Proveedor' : 'Proveedor';
		notifyProviderAppointmentRescheduled({
			providerEmail: prov?.email,
			providerName: provNombre,
			ownerDoc: cita.dueno,
			cita,
			fechaAnterior
		}).catch((err) => console.error('notifyProviderAppointmentRescheduled:', err.message));

		const updated = await Cita.findById(cita._id)
			.populate('proveedor', 'name lastName email providerType')
			.populate('dueno', 'name lastName email');

		return res.status(200).json({ message: 'Cita reagendada', cita: updated });
	} catch (err) {
		next(err);
	}
}

/**
 * PATCH /api/citas/:id/diagnostico
 */
async function recordDiagnosis(req, res, next) {
	try {
		const { id } = req.params;
		const { diagnostico } = req.body || {};

		if (!mongoose.isValidObjectId(id)) {
			return res.status(400).json({ message: 'Id de cita inválido' });
		}

		if (diagnostico === undefined || diagnostico === null || !String(diagnostico).trim()) {
			return res.status(400).json({ message: 'diagnostico es obligatorio' });
		}

		const cita = await Cita.findById(id);

		if (!cita) {
			return res.status(404).json({ message: 'Cita no encontrada' });
		}

		if (proveedorIdString(cita) !== req.user.id) {
			return res.status(403).json({ message: 'Solo el proveedor de la cita puede registrar el diagnóstico' });
		}

		cita.diagnostico = String(diagnostico).trim();
		cita.estado = 'completada';
		await cita.save();

		await Appointment.updateMany(
			{ legacyCitaId: cita._id },
			{ $set: { status: 'completed' } }
		).catch((e) => console.error('[HU-14] sync diagnóstico Appointment:', e.message));

		const updated = await Cita.findById(cita._id)
			.populate('proveedor', 'name lastName email providerType')
			.populate('dueno', 'name lastName email');

		return res.status(200).json({ message: 'Diagnóstico registrado', cita: updated });
	} catch (err) {
		next(err);
	}
}

/**
 * PATCH /api/citas/:id/proveedor/confirmar
 */
async function confirmCitaAsProvider(req, res, next) {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id)) {
			return res.status(400).json({ message: 'Id de cita inválido' });
		}

		const cita = await Cita.findById(id);
		if (!cita) {
			return res.status(404).json({ message: 'Cita no encontrada' });
		}
		if (proveedorIdString(cita) !== req.user.id) {
			return res.status(403).json({ message: 'Solo el proveedor de la cita puede confirmarla' });
		}
		if (cita.estado !== 'pendiente') {
			return res.status(400).json({ message: 'Solo se pueden confirmar citas en estado pendiente' });
		}

		cita.estado = 'confirmada';
		await cita.save();

		await Appointment.updateMany(
			{ legacyCitaId: cita._id },
			{ $set: { status: 'confirmed' } }
		).catch((e) => console.error('[HU-14] sync confirm Appointment:', e.message));

		const updated = await Cita.findById(cita._id)
			.populate('proveedor', 'name lastName email providerType')
			.populate('dueno', 'name lastName email');

		return res.status(200).json({ message: 'Cita confirmada', cita: updated });
	} catch (err) {
		next(err);
	}
}

/**
 * PATCH /api/citas/:id/proveedor/cancelar
 */
async function cancelCitaAsProvider(req, res, next) {
	try {
		const { id } = req.params;
		const motivo =
			req.body?.motivo == null || !String(req.body.motivo).trim()
				? 'Cancelada por el proveedor'
				: String(req.body.motivo).trim().slice(0, 200);

		if (!mongoose.isValidObjectId(id)) {
			return res.status(400).json({ message: 'Id de cita inválido' });
		}

		const cita = await Cita.findById(id);
		if (!cita) {
			return res.status(404).json({ message: 'Cita no encontrada' });
		}
		if (proveedorIdString(cita) !== req.user.id) {
			return res.status(403).json({ message: 'Solo el proveedor de la cita puede cancelarla' });
		}
		if (!['pendiente', 'confirmada'].includes(cita.estado)) {
			return res.status(400).json({ message: 'No se puede cancelar esta cita en su estado actual' });
		}

		cita.estado = 'cancelada';
		await cita.save();

		await Appointment.updateMany(
			{ legacyCitaId: cita._id },
			{
				$set: {
					status: 'cancelled_by_provider',
					cancelledAt: new Date(),
					cancellationReason: motivo
				}
			}
		).catch((e) => console.error('[HU-14] sync cancel provider Cita:', e.message));

		const updated = await Cita.findById(cita._id)
			.populate('proveedor', 'name lastName email providerType')
			.populate('dueno', 'name lastName email');

		return res.status(200).json({ message: 'Cita cancelada', cita: updated });
	} catch (err) {
		next(err);
	}
}

module.exports = {
	createOwnerAppointment,
	listMyAppointments,
	listUpcomingAppointments,
	cancelAppointment,
	rescheduleAppointment,
	recordDiagnosis,
	confirmCitaAsProvider,
	cancelCitaAsProvider
};
