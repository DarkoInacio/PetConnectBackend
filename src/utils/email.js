'use strict';

const { getTransporter } = require('../config/mailer');

async function sendEmail({ to, subject, html, text }) {
	const from = process.env.MAIL_FROM || 'PetConnect <no-reply@petconnect.app>';
	const transporter = getTransporter();
	const info = await transporter.sendMail({
		from,
		to,
		subject,
		text,
		html
	});
	return info;
}

module.exports = { sendEmail };