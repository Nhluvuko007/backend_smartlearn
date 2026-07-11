const express = require('express');
const router = express.Router();
const crypto = require('crypto'); // Built-in Node library for secure tokens
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Secret token fallback signature string if .env is missing it
const JWT_SECRET = process.env.JWT_SECRET || 'smartlearn_ultra_secure_fallback_key';

// 1. REGISTER NEW USER ACCOUNT
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All registration form fields are required.' });
    }

    // Check if the user already exists in the system database
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'An account with this email address already exists.' });
    }

    // Hash the raw text password using a safe cryptographic work factor factor of 10
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Persist user account definitions to cloud instance
    const newUser = new User({
      username,
      email,
      password: hashedPassword
    });

    await newUser.save();
    res.status(201).json({ message: 'User account registered successfully! You can now log in.' });

  } catch (error) {
    res.status(500).json({ message: 'Registration subsystem breakdown', error: error.message });
  }
});

// 2. AUTHENTICATE / LOGIN EXISTING USER
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are both required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid account email or password credentials.' });
    }

    // Un-hash and cross-examine database password match
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid account email or password credentials.' });
    }

    // Sign a secure JWT session token containing user details that expires in 7 days
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      token,
      user: { id: user._id, username: user.username, email: user.email }
    });

  } catch (error) {
    res.status(500).json({ message: 'Login authentication error', error: error.message });
  }
});

// 1. FORGOT PASSWORD: Generate token and print link
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email address is required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Security Best Practice: Don't explicitly reveal that the email doesn't exist 
      // to prevent account enumeration sniffing attacks.
      return res.status(200).json({ message: 'If that email exists in our system, a recovery link has been generated.' });
    }

    // Generate a secure 20-byte hex token string
    const token = crypto.randomBytes(20).toString('hex');

    // Save token and set expiration window to exactly 15 minutes from right now
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; 
    await user.save();

    // The destination reset URL pointing to your live Vercel app frontend route
    const resetUrl = `https://smartlearn-bice.vercel.app/reset-password/${token}`;

    // 🔬 Temporary Debug Log: This lets you copy the link straight from Render logs to test!
    console.log(`\n🔑 [RESET TOKEN GENERATED] for ${user.email}:\n👉 URL: ${resetUrl}\n`);

    res.status(200).json({ 
      message: 'If that email exists in our system, a recovery link has been generated.' 
    });

  } catch (error) {
    res.status(500).json({ message: 'Error initiating password reset', error: error.message });
  }
});

// 2. RESET PASSWORD: Verify token expiration window and update password
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'New password value is required.' });
    }

    // Find a user who has this token AND where the expiration date is greater than right now
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() } // $gt = Greater Than Current Time
    });

    if (!user) {
      return res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
    }

    // Hash the new secure password credentials
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // Wipe out the transient recovery tokens so they can never be reused
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ message: 'Password updated successfully! You can now log in.' });

  } catch (error) {
    res.status(500).json({ message: 'Error rewriting account password', error: error.message });
  }
});

module.exports = router;