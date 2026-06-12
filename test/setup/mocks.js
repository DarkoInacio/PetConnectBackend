'use strict';

jest.mock('../../src/utils/email', () => ({
	sendEmail: jest.fn().mockResolvedValue({ messageId: 'mock-message-id' })
}));

jest.mock('../../src/services/openaiChat.service', () => ({
	callOpenAiChat: jest.fn().mockResolvedValue({
		ok: true,
		content: '{"reply":"Respuesta mock de Vetto","urgencyLevel":"verde"}',
		parsed: { reply: 'Respuesta mock de Vetto', urgencyLevel: 'verde' }
	})
}));

jest.mock('node-cron', () => ({
	schedule: jest.fn(() => ({
		stop: jest.fn(),
		start: jest.fn()
	}))
}));

jest.mock('../../src/config/multer', () => {
	const passThrough = (req, res, next) => next();
	return {
		upload: { single: () => passThrough },
		uploadProviderGallery: {
			array: () => (req, res, next) => {
				req.files = [];
				next();
			}
		}
	};
});

jest.mock('../../src/config/multerPetPhoto', () => {
	const passThrough = (req, res, next) => next();
	return {
		uploadPetPhotoMemory: { single: () => passThrough }
	};
});

jest.mock('../../src/config/multerMedical', () => {
	const passThrough = (req, res, next) => {
		req.files = [];
		next();
	};
	return {
		uploadClinicalAttachments: { array: () => passThrough },
		clinicalDir: '/tmp/clinical-test'
	};
});
