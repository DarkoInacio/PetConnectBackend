'use strict';

const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
	if (transporter) return transporter;

	const host = process.env.MAIL_HOST;
	const port = Number(process.env.MAIL_PORT || 587);
	const user = process.env.MAIL_USER;
	const pass = process.env.MAIL_PASS;

	if (!host || !user || !pass) {
		console.warn('Advertencia: configuración de correo incompleta. Revisar variables MAIL_*');
	}

	transporter = nodemailer.createTransport({
		host,
		port,
		secure: port === 465,
		auth: user && pass ? { user, pass } : undefined
	});
	return transporter;
}

module.exports = { getTransporter };