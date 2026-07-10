const express = require('express');
const router = express.Router();
const Deck = require('../models/Deck');
const auth = require('../middleware/auth');

// 1. GET ALL DECKS (Filtered strictly for the logged-in user)
router.get('/', auth, async (req, res) => {
  try {
    // req.user.userId comes straight out of our decrypted JWT middleware token
    const userDecks = await Deck.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.status(200).json(userDecks);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving user decks', error: error.message });
  }
});

// 2. CREATE A NEW DECK (Tied directly to the logged-in user)
router.post('/', auth, async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Deck title is required' });
    }

    const newDeck = new Deck({
      userId: req.user.userId, // Securely lock this deck to this specific user account
      title,
      description
    });

    const savedDeck = await newDeck.save();
    res.status(201).json(savedDeck);
  } catch (error) {
    res.status(500).json({ message: 'Error saving user deck', error: error.message });
  }
});

module.exports = router;