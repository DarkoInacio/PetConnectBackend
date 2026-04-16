'use strict';

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
	{
		providerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		ownerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		rating: {
			type: Number,
			required: true,
			min: 1,
			max: 5
		},
		comment: {
			type: String,
			trim: true,
			maxlength: 2000,
			default: ''
		}
	},
	{
		timestamps: true
	}
);

reviewSchema.index({ providerId: 1, ownerId: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
