'use strict';

const { sendEmail } = require('./email');

function getAdminNotificationRecipients() {
	const raw = process.env.ADMIN_NOTIFICATION_EMAILS || process.env.ADMIN_EMAIL || '';
	return raw
		.split(/[,;]/)
		.map((e) => e.trim())
		.filter(Boolean);
}

async function notifyAdminsNewProvider(userSummary) {
	const recipients = getAdminNotificationRecipients();
	if (recipients.length === 0) {
		console.warn('ADMIN_NOTIFICATION_EMAILS no definido: no se notificó nuevo proveedor.');
		return;
	}
	const html = `
		<p>Nuevo proveedor pendiente de revisión en PetConnect.</p>
		<ul>
			<li><strong>Nombre:</strong> ${escapeHtml(userSummary.name)} ${escapeHtml(userSummary.lastName)}</li>
			<li><strong>Correo:</strong> ${escapeHtml(userSummary.email)}</li>
			<li><strong>Tipo:</strong> ${escapeHtml(userSummary.providerType)}</li>
			<li><strong>Teléfono:</strong> ${escapeHtml(userSummary.phone || '—')}</li>
		</ul>
	`;
	for (const to of recipients) {
		try {
			await sendEmail({
				to,
				subject: 'PetConnect: nuevo proveedor en revisión',
				html
			});
		} catch (err) {
			console.error('Error enviando notificación a admin:', to, err.message);
		}
	}
}

function escapeHtml(s) {
	if (s == null) return '';
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

module.exports = { getAdminNotificationRecipients, notifyAdminsNewProvider };
