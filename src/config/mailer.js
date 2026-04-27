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
		const error = new Error(
			'Configuración de correo incompleta. Define MAIL_HOST, MAIL_PORT, MAIL_USER y MAIL_PASS en el backend.'
		);
		error.status = 500;
		error.code = 'MAIL_CONFIG_MISSING';
		throw error;
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