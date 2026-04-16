'use strict';

const { sendEmail } = require('./email');

function escapeHtml(s) {
	if (s == null) return '';
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function ownerLine(ownerDoc) {
	if (!ownerDoc) return 'Un dueño';
	const nombre = `${ownerDoc.name || ''} ${ownerDoc.lastName || ''}`.trim();
	return escapeHtml(nombre || 'Dueño');
}

async function notifyProviderAppointmentCanceled({ providerEmail, providerName, ownerDoc, cita }) {
	if (!providerEmail) {
		console.warn('notifyProviderAppointmentCanceled: proveedor sin correo.');
		return;
	}
	const html = `
		<p>Hola ${escapeHtml(providerName)},</p>
		<p><strong>${ownerLine(ownerDoc)}</strong> ha cancelado una cita en PetConnect.</p>
		<ul>
			<li><strong>Servicio:</strong> ${escapeHtml(cita.servicio)}</li>
			<li><strong>Fecha:</strong> ${escapeHtml(new Date(cita.fecha).toISOString())}</li>
			<li><strong>Mascota:</strong> ${escapeHtml(cita.mascota?.nombre)} (${escapeHtml(cita.mascota?.especie)})</li>
		</ul>
	`;
	try {
		await sendEmail({
			to: providerEmail,
			subject: 'PetConnect: cita cancelada por el dueño',
			html
		});
	} catch (err) {
		console.error('Error notificando cancelación de cita al proveedor:', err.message);
	}
}

async function notifyProviderAppointmentRescheduled({ providerEmail, providerName, ownerDoc, cita, fechaAnterior }) {
	if (!providerEmail) {
		console.warn('notifyProviderAppointmentRescheduled: proveedor sin correo.');
		return;
	}
	const html = `
		<p>Hola ${escapeHtml(providerName)},</p>
		<p><strong>${ownerLine(ownerDoc)}</strong> ha reagendado una cita en PetConnect.</p>
		<ul>
			<li><strong>Servicio:</strong> ${escapeHtml(cita.servicio)}</li>
			<li><strong>Fecha anterior:</strong> ${escapeHtml(new Date(fechaAnterior).toISOString())}</li>
			<li><strong>Nueva fecha:</strong> ${escapeHtml(new Date(cita.fecha).toISOString())}</li>
			<li><strong>Mascota:</strong> ${escapeHtml(cita.mascota?.nombre)} (${escapeHtml(cita.mascota?.especie)})</li>
		</ul>
	`;
	try {
		await sendEmail({
			to: providerEmail,
			subject: 'PetConnect: cita reagendada',
			html
		});
	} catch (err) {
		console.error('Error notificando reagendación de cita al proveedor:', err.message);
	}
}

module.exports = {
	notifyProviderAppointmentCanceled,
	notifyProviderAppointmentRescheduled
};
