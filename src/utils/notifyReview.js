'use strict';

const { sendEmail } = require('./email');
const User = require('../models/User');

function esc(s) {
	if (s == null) return '';
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function providerDisplayName(user) {
	if (!user) return 'Proveedor';
	return `${user.name || ''} ${user.lastName || ''}`.trim() || 'Proveedor';
}

function ownerFirstName(user) {
	if (!user) return 'Hola';
	return user.name || 'Hola';
}

/** Notificar al proveedor: nueva reseña */
async function notifyProviderNewReview({ providerUser, ownerUser, review }) {
	if (!providerUser?.email) return;
	const pName = providerDisplayName(providerUser);
	const subject = 'PetConnect: Nueva reseña en tu perfil';
	const html = `<p>${esc(pName)},</p>
<p>Has recibido una nueva calificación (${review.rating}/5) de ${esc(ownerUser ? `${ownerUser.name} ${ownerUser.lastName}` : 'un dueño')}.</p>
${review.comment ? `<p>Comentario: ${esc(review.comment)}</p>` : ''}
<p>Revisa y responde desde el panel de proveedor.</p>`;
	await sendEmail({ to: providerUser.email, subject, html });
}

/** Notificar al dueño: el proveedor respondió a su reseña */
async function notifyOwnerProviderRepliedToReview({ ownerUser, providerUser, review }) {
	if (!ownerUser?.email) return;
	const subj = 'PetConnect: Respuesta a tu reseña';
	const html = `<p>${esc(ownerFirstName(ownerUser))},</p>
<p>${esc(providerDisplayName(providerUser))} ha respondido a tu reseña.</p>
<p><strong>Respuesta:</strong></p>
<p>${esc((review.providerReply && review.providerReply.text) || '')}</p>`;
	await sendEmail({ to: ownerUser.email, subject: subj, html });
}

/** Notificar al dueño: su reseña fue eliminada por moderación */
async function notifyOwnerReviewRemoved({ ownerUser, reasonText }) {
	if (!ownerUser?.email) return;
	const html = `<p>${esc(ownerFirstName(ownerUser))},</p>
<p>Te informamos que una de tus reseñas ha sido retirada de la plataforma tras una revisión.</p>
${reasonText ? `<p><strong>Motivo:</strong> ${esc(reasonText)}</p>` : ''}
<p>Gracias por entender. Si tienes dudas, contacta a soporte.</p>`;
	await sendEmail({ to: ownerUser.email, subject: 'PetConnect: Reseña retirada', html });
}

/** Primer admin en BD o lista en env */
async function getAdminNotifyEmails() {
	if (process.env.ADMIN_REVIEW_EMAILS) {
		return process.env.ADMIN_REVIEW_EMAILS.split(/[,;]/).map((e) => e.trim()).filter(Boolean);
	}
	const admin = await User.findOne({ role: 'admin' }).select('email').lean();
	return admin && admin.email ? [admin.email] : [];
}

async function notifyAdminsNewReport({ report, review, reporter }) {
	const emails = await getAdminNotifyEmails();
	if (!emails.length) {
		console.warn('[review-report] No hay email de admin (ADMIN_REVIEW_EMAILS o usuario admin).');
		return;
	}
	const rId = String(review._id);
	const subject = 'PetConnect: Nuevo reporte de reseña';
	const html = `<p>Reporte de reseña pendiente.</p>
<ul>
<li>ID reseña: ${esc(rId)}</li>
<li>Motivo: ${esc(report.reason)}</li>
<li>Comentario adicional: ${esc(report.otherText || '—')}</li>
<li>Quien reporta: ${esc(reporter ? `${reporter.name} ${reporter.lastName}` : '—')} (${esc(reporter && reporter.email)})</li>
</ul>
<p>Revisar en el panel de administración.</p>`;
	for (const to of emails) {
		await sendEmail({ to, subject, html });
	}
}

module.exports = {
	notifyProviderNewReview,
	notifyOwnerProviderRepliedToReview,
	notifyOwnerReviewRemoved,
	notifyAdminsNewReport,
	providerDisplayName
};
