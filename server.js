const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment configurations
dotenv.config();

// Import Route Handlers
const authRoutes = require('./routes/authRoutes');
const deckRoutes = require('./routes/deckRoutes');
const cardRoutes = require('./routes/cardRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: 'https://smartlearn-bice.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json()); // Essential for handling incoming JSON data

// Establish MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Successfully connected to MongoDB local instance.'))
  .catch((err) => console.error('❌ MongoDB database connection error:', err));

// Mount API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/decks', deckRoutes);
app.use('/api/cards', cardRoutes);

// Core health-check route
app.get('/', (req, res) => {
  res.send('Smart Learning Platform Express Server is running smoothly!');
});

// Add this temporary snippet to print out all registered endpoints on startup
console.log("=== REGISTERED ROUTES ===");
app._router.stack.forEach((r) => {
  if (r.route && r.route.path) {
    console.log(`Route: ${Object.keys(r.route.methods).toUpperCase()} ${r.route.path}`);
  } else if (r.name === 'router') {
    r.handle.stack.forEach((handler) => {
      if (handler.route) {
        console.log(`Auth Route: ${Object.keys(handler.route.methods).join(',').toUpperCase()} ${handler.route.path}`);
      }
    });
  }
});

// Start listening for traffic
app.listen(PORT, () => {
  console.log(`🚀 Node.js gateway active on http://localhost:${PORT}`);
});