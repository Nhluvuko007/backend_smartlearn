const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true, // Prevents duplicate email accounts
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },

  // ◄ Add these two transient fields for security tracking
  resetPasswordToken: { 
    type: String 
  },
  resetPasswordExpires: { 
    type: Date 
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);