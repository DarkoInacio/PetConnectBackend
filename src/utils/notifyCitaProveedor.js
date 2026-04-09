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

function duenoLinea(duenoDoc) {
	if (!duenoDoc) return 'Un dueño';
	const nombre = `${duenoDoc.name || ''} ${duenoDoc.lastName || ''}`.trim();
	return escapeHtml(nombre || 'Dueño');
}

async function notifyProveedorCitaCancelada({ proveedorEmail, proveedorNombre, duenoDoc, cita }) {
	if (!proveedorEmail) {
		console.warn('notifyProveedorCitaCancelada: proveedor sin correo.');
		return;
	}
	const html = `
		<p>Hola ${escapeHtml(proveedorNombre)},</p>
		<p><strong>${duenoLinea(duenoDoc)}</strong> ha cancelado una cita en PetConnect.</p>
		<ul>
			<li><strong>Servicio:</strong> ${escapeHtml(cita.servicio)}</li>
			<li><strong>Fecha:</strong> ${escapeHtml(new Date(cita.fecha).toISOString())}</li>
			<li><strong>Mascota:</strong> ${escapeHtml(cita.mascota?.nombre)} (${escapeHtml(cita.mascota?.especie)})</li>
		</ul>
	`;
	try {
		await sendEmail({
			to: proveedorEmail,
			subject: 'PetConnect: cita cancelada por el dueño',
			html
		});
	} catch (err) {
		console.error('Error notificando cancelación de cita al proveedor:', err.message);
	}
}

async function notifyProveedorCitaReagendada({ proveedorEmail, proveedorNombre, duenoDoc, cita, fechaAnterior }) {
	if (!proveedorEmail) {
		console.warn('notifyProveedorCitaReagendada: proveedor sin correo.');
		return;
	}
	const html = `
		<p>Hola ${escapeHtml(proveedorNombre)},</p>
		<p><strong>${duenoLinea(duenoDoc)}</strong> ha reagendado una cita en PetConnect.</p>
		<ul>
			<li><strong>Servicio:</strong> ${escapeHtml(cita.servicio)}</li>
			<li><strong>Fecha anterior:</strong> ${escapeHtml(new Date(fechaAnterior).toISOString())}</li>
			<li><strong>Nueva fecha:</strong> ${escapeHtml(new Date(cita.fecha).toISOString())}</li>
			<li><strong>Mascota:</strong> ${escapeHtml(cita.mascota?.nombre)} (${escapeHtml(cita.mascota?.especie)})</li>
		</ul>
	`;
	try {
		await sendEmail({
			to: proveedorEmail,
			subject: 'PetConnect: cita reagendada',
			html
		});
	} catch (err) {
		console.error('Error notificando reagendación de cita al proveedor:', err.message);
	}
}

module.exports = {
	notifyProveedorCitaCancelada,
	notifyProveedorCitaReagendada
};
