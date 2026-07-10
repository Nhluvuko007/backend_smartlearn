const express = require('express');
const router = express.Router();
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

module.exports = router;