const mongoose = require('mongoose');

const connectionSchema = new mongoose.Schema({
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['connected'],
    default: 'connected',
  },
  initialMessage: {
    type: String,
    trim: true,
    maxlength: 1000,
  },
}, {
  timestamps: true,
});

connectionSchema.index({ brandId: 1, creatorId: 1 }, { unique: true });

const Connection = mongoose.model('Connection', connectionSchema);
module.exports = Connection;
