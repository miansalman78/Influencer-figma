const mongoose = require('mongoose');

const portfolioSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['photo', 'video', 'link'],
    required: true
  },
  url: { type: String, required: true },
  thumbnail: { type: String },
  title: { type: String, trim: true, maxlength: 120 },
  description: { type: String, maxlength: 500 },
  tags: [{ type: String, trim: true }],
  order: { type: Number, default: 0 },
  isPublic: { type: Boolean, default: true },
  metadata: {
    durationSec: { type: Number },
    width: { type: Number },
    height: { type: Number },
    platform: { type: String } // e.g., instagram, tiktok, youtube
  }
}, {
  timestamps: true
});

// Ensure a stable ordering
portfolioSchema.index({ userId: 1, order: 1, createdAt: -1 });

module.exports = mongoose.model('Portfolio', portfolioSchema);
