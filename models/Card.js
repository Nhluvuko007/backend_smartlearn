const mongoose = require('mongoose');

const CardSchema = new mongoose.Schema({
  deckId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deck',
    required: true
  },
  front: {
    type: String,
    required: true,
    trim: true
  },
  back: {
    type: String,
    required: true,
    trim: true
  },
  // --- Spaced Repetition Fields (Calculated by Python) ---
  repetitions: {
    type: Number,
    default: 0
  },
  interval: {
    type: Number,
    default: 1 // Next review defaults to 1 day later
  },
  easeFactor: {
    type: Number,
    default: 2.5 // Standard SM-2 starting multiplier
  },
  nextReviewDate: {
    type: Date,
    default: Date.now // Defaults to right now so it's immediately study-ready
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Card', CardSchema);