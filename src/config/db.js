'use strict';

const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

async function connectMongo() {
	const mongoUri = process.env.MONGODB_URI;
	if (!mongoUri) {
		throw new Error('MONGODB_URI no está definido en variables de entorno.');
	}

	try {
		await mongoose.connect(mongoUri, {
			autoIndex: true
		});
		console.log('Conectado a MongoDB');
	} catch (error) {
		console.error('Error conectando a MongoDB:', error.message);
		throw error;
	}
}

module.exports = { connectMongo };