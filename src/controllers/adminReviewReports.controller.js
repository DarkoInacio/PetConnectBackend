'use strict';

const mongoose = require('mongoose');
const Review = require('../models/Review');
const User = require('../models/User');
const ReviewReport = require('../models/ReviewReport');
const { syncProviderRatingToUser } = require('../services/providerRating.service');
const { notifyOwnerReviewRemoved } = require('../utils/notifyReview');

/**
 * GET /api/admin/review-reports?estado=pendiente
 */
async function listReports(req, res, next) {
	try {
		const filter = {};
		if (String(req.query.estado || 'pendiente') === 'pendiente') {
			filter.status = 'pendiente';
		} else if (req.query.estado) {
			filter.status = req.query.estado;
		}
		const list = await ReviewReport.find(filter)
			.sort({ createdAt: -1 })
			.populate('reviewId', 'rating comment ownerId providerId createdAt')
			.populate('reporterId', 'name lastName email')
			.limit(100)
			.lean();
		return res.status(200).json({ reports: list, total: list.length });
	} catch (e) {
		next(e);
	}
}

/**
 * PATCH /api/admin/review-reports/:reportId
 * body: { accion: 'aprobar_reseña' | 'eliminar_reseña' | 'suspender_autor', nota? }
 */
async function decideReport(req, res, next) {
	try {
		const { reportId } = req.params;
		if (!mongoose.isValidObjectId(reportId)) {
			return res.status(400).json({ message: 'Id inválido' });
		}
		const accion = req.body?.accion;
		const nota = req.body?.nota != null ? String(req.body.nota).trim().slice(0, 2000) : '';
		const rep = await ReviewReport.findById(reportId);
		if (!rep || rep.status !== 'pendiente') {
			return res.status(404).json({ message: 'Reporte no encontrable o ya resuelto' });
		}
		const review = await Review.findById(rep.reviewId);
		if (!review) {
			rep.status = 'revisada_resena_mantenida';
			rep.adminId = req.user.id;
			rep.adminDecidedAt = new Date();
			rep.adminNote = nota;
			await rep.save();
			return res.status(200).json({ message: 'Reporte cerrado (reseña inexistente)' });
		}
		rep.adminId = req.user.id;
		rep.adminDecidedAt = new Date();
		rep.adminNote = nota;

		if (accion === 'aprobar_reseña' || accion === 'aprobar') {
			rep.status = 'revisada_resena_mantenida';
			await rep.save();
			return res.status(200).json({ message: 'Reseña aprobada, reporte archivado' });
		}
		if (accion === 'eliminar_reseña' || accion === 'eliminar') {
			rep.status = 'revisada_resena_eliminada';
			await rep.save();
			const owner = await User.findById(review.ownerId);
			review.removedByAdmin = true;
			review.removedAt = new Date();
			await review.save();
			await syncProviderRatingToUser(review.providerId);
			notifyOwnerReviewRemoved({ ownerUser: owner, reasonText: nota || 'Contenido retirado por moderación' }).catch(
				(e) => console.error('notifyOwnerReviewRemoved', e.message)
			);
			return res.status(200).json({ message: 'Reseña retirada' });
		}
		if (accion === 'suspender_autor') {
			rep.status = 'revisada_autor_suspendido';
			await rep.save();
			await User.updateOne({ _id: review.ownerId, role: 'dueno' }, { $set: { reviewWriteSuspended: true } });
			return res.status(200).json({ message: 'Autor inhabilitado para nuevas reseñas' });
		}
		return res.status(400).json({
			message: 'accion invalida. Use aprobar_reseña, eliminar_reseña o suspender_autor'
		});
	} catch (e) {
		next(e);
	}
}

module.exports = { listReports, decideReport };
