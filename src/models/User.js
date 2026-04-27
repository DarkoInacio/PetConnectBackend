'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const USER_ROLES = ['dueno', 'proveedor', 'admin'];
const PROVIDER_STATUSES = ['en_revision', 'aprobado', 'rechazado'];
const PROVIDER_KINDS = ['veterinaria', 'paseador', 'cuidador'];

const addressSchema = new mongoose.Schema(
	{
		street: { type: String, trim: true },
		commune: { type: String, trim: true },
		city: { type: String, trim: true },
		coordinates: {
			lat: { type: Number },
			lng: { type: Number }
		}
	},
	{ _id: false }
);

const socialMediaSchema = new mongoose.Schema(
	{
		instagram: { type: String, trim: true },
		facebook: { type: String, trim: true },
		twitter: { type: String, trim: true },
		website: { type: String, trim: true }
	},
	{ _id: false }
);

const referenceRateSchema = new mongoose.Schema(
	{
		amount: { type: Number },
		currency: { type: String, default: 'CLP', trim: true },
		unit: { type: String, trim: true }
	},
	{ _id: false }
);

const walkerTariffsSchema = new mongoose.Schema(
	{
		walk30min: { type: Number, min: 0 },
		walk60min: { type: Number, min: 0 },
		dayCare: { type: Number, min: 0 },
		overnight: { type: Number, min: 0 },
		currency: { type: String, default: 'CLP', trim: true }
	},
	{ _id: false }
);

const weeklyAvailabilityRangeSchema = new mongoose.Schema(
	{
		start: { type: String, trim: true },
		end: { type: String, trim: true }
	},
	{ _id: false }
);

const weeklyAvailabilityDaySchema = new mongoose.Schema(
	{
		day: {
			type: String,
			enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
			required: true
		},
		enabled: { type: Boolean, default: true },
		ranges: [weeklyAvailabilityRangeSchema]
	},
	{ _id: false }
);

const providerProfileSchema = new mongoose.Schema(
	{
		address: addressSchema,
		licenseNumber: { type: String, trim: true },
		description: { type: String, trim: true },
		schedule: { type: String, trim: true },
		services: [{ type: String, trim: true }],
		specialties: [{ type: String, trim: true }],
		serviceCommunes: [{ type: String, trim: true }],
		petTypes: [{ type: String, trim: true }],
		experienceYears: { type: Number, min: 0 },
		petsAttended: { type: String, trim: true },
		weeklyAvailability: [weeklyAvailabilityDaySchema],
		walkerTariffs: walkerTariffsSchema,
		isPublished: { type: Boolean, default: true },
		operationalStatus: {
			type: String,
			enum: ['abierto', 'temporalmente_cerrado'],
			default: 'abierto'
		},
		ratingAverage: {
			type: Number,
			min: 0,
			max: 5
		},
		ratingCount: {
			type: Number,
			min: 0,
			default: 0
		},
		socialMedia: socialMediaSchema,
		referenceRate: referenceRateSchema,
		gallery: [{ type: String }],
		publicSlug: {
			type: String,
			trim: true,
			lowercase: true,
			default: undefined
		},
		rejectionReason: { type: String },
		reviewedAt: { type: Date },
		reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
		/** Recepción / tramos de clínica (hora Chile, HH:MM). Usados al generar disponibilidad. */
		agendaSlotStart: { type: String, trim: true },
		agendaSlotEnd: { type: String, trim: true }
	},
	{ _id: false }
);

const userSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: true,
			trim: true
		},
		lastName: {
			type: String,
			required: true,
			trim: true
		},
		email: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true
		},
		password: {
			type: String,
			required: true,
			minlength: 6,
			select: false
		},
		role: {
			type: String,
			enum: USER_ROLES,
			default: 'dueno',
			index: true
		},
		providerType: {
			type: String,
			default: null,
			validate: {
				validator(v) {
					if (v === null || v === undefined) return true;
					return PROVIDER_KINDS.includes(v);
				},
				message: 'Tipo de proveedor inválido'
			}
		},
		phone: {
			type: String,
			trim: true
		},
		profileImage: {
			type: String
		},
		providerProfile: {
			type: providerProfileSchema,
			default: undefined
		},
		status: {
			type: String,
			enum: PROVIDER_STATUSES.concat(['activo']),
			default: function () {
				return this.role === 'proveedor' ? 'en_revision' : 'activo';
			}
		},
		passwordResetToken: String,
		passwordResetExpires: Date
	},
	{
		timestamps: true
	}
);

userSchema.pre('save', async function (next) {
	if (!this.isModified('password')) return next();
	const salt = await bcrypt.genSalt(10);
	this.password = await bcrypt.hash(this.password, salt);
	next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
	return bcrypt.compare(candidatePassword, this.password);
};

userSchema.index({ 'providerProfile.publicSlug': 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('User', userSchema);
module.exports.USER_ROLES = USER_ROLES;
module.exports.PROVIDER_KINDS = PROVIDER_KINDS;
