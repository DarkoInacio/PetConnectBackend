'use strict';

const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Pet = require('../models/Pet');
const ClinicalEncounter = require('../models/ClinicalEncounter');
const User = require('../models/User');

const ALLOWED_PROXIMO = new Set([7, 15, 30]);

async function listVetPatients(req, res, next) {
	try {
		const providerId = req.user.id;
		const oid = new mongoose.Types.ObjectId(providerId);

		const me = await User.findById(providerId).select('providerType').lean();
		if (!me || me.providerType !== 'veterinaria') {
			return res.status(403).json({ message: 'Solo veterinarias pueden listar pacientes' });
		}

		const qRaw = req.query.q != null ? String(req.query.q).trim() : '';
		const q = qRaw.toLowerCase();

		let proximoDias = null;
		if (req.query.proximoDias !== undefined && req.query.proximoDias !== '') {
			const n = Number(req.query.proximoDias);
			if (!ALLOWED_PROXIMO.has(n)) {
				return res.status(400).json({ message: 'proximoDias debe ser 7, 15 o 30' });
			}
			proximoDias = n;
		}

		/** Citas marcadas como completadas (con mascota). */
		const grouped = await Appointment.aggregate([
			{
				$match: {
					providerId: oid,
					status: 'completed',
					petId: { $exists: true, $ne: null }
				}
			},
			{
				$group: {
					_id: '$petId',
					lastVisitAt: { $max: '$startAt' }
				}
			}
		]);

		/**
		 * Fichas clínicas firmadas: el flujo permite registrar la atención con cita aún en "confirmed",
		 * sin pasar por "completed". Esas mascotas deben aparecer como pacientes atendidos.
		 */
		const encGrouped = await ClinicalEncounter.aggregate([
			{ $match: { providerId: oid } },
			{ $group: { _id: '$petId', lastEncounterAt: { $max: '$occurredAt' } } }
		]);

		const lastMap = new Map();
		for (const g of grouped) {
			if (!g._id) continue;
			const id = g._id.toString();
			lastMap.set(id, new Date(g.lastVisitAt));
		}
		for (const g of encGrouped) {
			if (!g._id) continue;
			const id = g._id.toString();
			const encAt = new Date(g.lastEncounterAt);
			const prev = lastMap.get(id);
			if (!prev || encAt.getTime() > prev.getTime()) {
				lastMap.set(id, encAt);
			}
		}

		const petIds = [...lastMap.keys()].map((id) => new mongoose.Types.ObjectId(id));

		const pets = await Pet.find({ _id: { $in: petIds } })
			.populate('ownerId', 'name lastName email')
			.lean();

		let items = [];

		for (const p of pets) {
			const pid = p._id.toString();
			const lastVisitAt = lastMap.get(pid);
			const owner = p.ownerId && typeof p.ownerId === 'object' ? p.ownerId : null;
			const ownerFull = owner ? `${owner.name || ''} ${owner.lastName || ''}`.trim().toLowerCase() : '';
			const petName = (p.name || '').toLowerCase();

			if (q && !petName.includes(q) && !ownerFull.includes(q)) {
				continue;
			}

			const latestEnc = await ClinicalEncounter.findOne({ petId: p._id, providerId: oid })
				.sort({ occurredAt: -1 })
				.select('proximoControl')
				.lean();

			let proximoControl = null;
			if (latestEnc?.proximoControl?.fecha) {
				proximoControl = {
					fecha: latestEnc.proximoControl.fecha,
					motivo: latestEnc.proximoControl.motivo || ''
				};
			}

			const completedAppts = await Appointment.find({
				providerId: oid,
				petId: p._id,
				status: 'completed'
			})
				.sort({ startAt: -1 })
				.select('_id')
				.lean();

			let pendingEncounterAppointmentId = null;
			for (const ap of completedAppts) {
				const hasEnc = await ClinicalEncounter.exists({ appointmentId: ap._id, providerId: oid });
				if (!hasEnc) {
					pendingEncounterAppointmentId = String(ap._id);
					break;
				}
			}

			items.push({
				petId: pid,
				lastVisitAt,
				proximoControl,
				pendingEncounterAppointmentId,
				pet: {
					id: pid,
					name: p.name,
					species: p.species,
					breed: p.breed || '',
					fotoUrl: p.foto ? `/uploads/${String(p.foto).replace(/^\//, '')}` : null
				},
				owner: owner
					? { name: owner.name || '', lastName: owner.lastName || '' }
					: { name: '', lastName: '' }
			});
		}

		if (proximoDias != null) {
			const now = new Date();
			const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
			const end = new Date(start);
			end.setDate(end.getDate() + proximoDias);
			end.setHours(23, 59, 59, 999);

			items = items.filter((it) => {
				const f = it.proximoControl?.fecha;
				if (!f) return false;
				const d = new Date(f);
				return d >= start && d <= end;
			});
		}

		items.sort((a, b) => new Date(b.lastVisitAt) - new Date(a.lastVisitAt));

		return res.status(200).json({ items });
	} catch (err) {
		next(err);
	}
}

module.exports = { listVetPatients };
