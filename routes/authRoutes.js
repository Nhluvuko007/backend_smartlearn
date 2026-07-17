const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const User = require('../models/User');

// Secret token fallback signature string if .env is missing it
const JWT_SECRET = process.env.JWT_SECRET || 'smartlearn_ultra_secure_fallback_key';

// Middleware to verify the JWT (add this at the top of the file)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access denied' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Initialize Resend with your environment API Key
const resend = new Resend(process.env.RESEND_API_KEY);

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

// 1. FORGOT PASSWORD: Generate token and send email link via Resend API
router.post('/forgot-password', async (req, res) => {
  console.log("🚀 Forgot password request received for email:", req.body.email);
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email address is required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json({ message: 'Please note the email with a recovery link has been sent.' });
    }

    const token = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; 
    await user.save();

    const resetUrl = `https://smartlearn-bice.vercel.app/reset-password/${token}`;

    console.log("✈️ Attempting to dispatch email over Resend API...");
    try {
      // 2. Send email via HTTPS using Resend
      await resend.emails.send({
        from: 'SmartLearn <onboarding@resend.dev>',
        to: user.email,
        subject: '🧠 SmartLearn - Password Reset Request',
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #1e3a8a; text-align: center;">🧠 SmartLearn</h2>
            <p>Hello, <strong>${user.username}</strong>,</p>
            <p>We received a request to reset your password. Click the button below to configure your new credentials. This link expires in 15 minutes.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
            </div>
            <p style="color: #64748b; font-size: 0.85rem;">If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="color: #2563eb; font-size: 0.85rem; word-break: break-all;">${resetUrl}</p>
          </div>
        `,
      });
      console.log("✉️ Recovery email dispatched cleanly via Resend!");
    } catch (emailError) {
      console.error('❌ Resend API delivery failed:', emailError.message);
      console.log(`👉 FALLBACK LOGGED LINK: ${resetUrl}`);
    }

    return res.status(200).json({ 
      message: 'Please note the email with a recovery link has been sent.' 
    });

  } catch (error) {
    console.error("🔥 CRITICAL CONTROLLER CRASH:", error);
    return res.status(500).json({ message: 'Internal server processing error', error: error.message });
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

// GET Profile - Fetch user details
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

// UPDATE Profile - Change username or email
router.patch('/profile', authenticateToken, async (req, res) => {
  try {
    const { username, email } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      { username, email },
      { new: true }
    ).select('-password');
    
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile' });
  }
});

module.exports = router;