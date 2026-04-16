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

function fullName(doc, fallback) {
	if (!doc) return fallback;
	const name = `${doc.name || ''} ${doc.lastName || ''}`.trim();
	return escapeHtml(name || fallback);
}

async function notifyProveedorAppointmentCancelada({
	proveedorEmail,
	proveedorDoc,
	duenoDoc,
	appointment,
	cancellationReason
}) {
	if (!proveedorEmail) {
		console.warn('notifyProveedorAppointmentCancelada: proveedor sin correo.');
		return;
	}

	const mascotaNombre = appointment?.pet?.name ? escapeHtml(appointment.pet.name) : 'No informado';
	const mascotaEspecie = appointment?.pet?.species
		? ` (${escapeHtml(appointment.pet.species)})`
		: '';
	const motivo = escapeHtml(cancellationReason || 'Sin motivo');

	const html = `
		<p>Hola ${fullName(proveedorDoc, 'Proveedor')},</p>
		<p><strong>${fullName(duenoDoc, 'Dueño')}</strong> ha cancelado una cita en PetConnect.</p>
		<ul>
			<li><strong>Mascota:</strong> ${mascotaNombre}${mascotaEspecie}</li>
			<li><strong>Fecha y hora:</strong> ${escapeHtml(new Date(appointment.startAt).toISOString())}</li>
			<li><strong>Motivo:</strong> ${motivo}</li>
		</ul>
	`;

	try {
		await sendEmail({
			to: proveedorEmail,
			subject: 'PetConnect: cita cancelada por el dueño',
			html
		});
	} catch (err) {
		console.error('Error notificando cancelación de appointment al proveedor:', err.message);
	}
}

module.exports = { notifyProveedorAppointmentCancelada };
