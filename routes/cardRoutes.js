const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() }); // Keep file inside transient memory
const Card = require('../models/Card');
const axios = require('axios');
const auth = require('../middleware/auth'); // 1. Inject our Security Guard Middleware

// Dynamic Python Endpoint Selector
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000';

// 1. CREATE a flashcard inside a deck (Protected)
router.post('/', auth, async (req, res) => {
  try {
    const { deckId, front, back } = req.body;

    if (!deckId || !front || !back) {
      return res.status(400).json({ message: 'deckId, front, and back fields are all required.' });
    }

    const newCard = new Card({ deckId, front, back });
    const savedCard = await newCard.save();
    res.status(201).json(savedCard);
  } catch (error) {
    res.status(500).json({ message: 'Error creating flashcard', error: error.message });
  }
});

// 2. GET ALL flashcards belonging to a specific deck (Protected)
router.get('/deck/:deckId', auth, async (req, res) => {
  try {
    const { deckId } = req.params;
    const cards = await Card.find({ deckId });
    res.status(200).json(cards);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching cards for this deck', error: error.message });
  }
});

// 3. GET DUE CARDS (The Smart Study Queue - Protected)
router.get('/deck/:deckId/study', auth, async (req, res) => {
  try {
    const { deckId } = req.params;
    const rightNow = new Date();

    const dueCards = await Card.find({
      deckId: deckId,
      nextReviewDate: { $lte: rightNow } 
    });

    res.status(200).json(dueCards);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching study queue', error: error.message });
  }
});

// 4. SUBMIT CARD REVIEW (Talks to Live Python Microservice - Protected)
router.post('/:cardId/review', auth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { rating } = req.body; 

    if (!rating || rating < 1 || rating > 4) {
      return res.status(400).json({ message: 'Valid review rating (1-4) is required.' });
    }

    const card = await Card.findById(cardId);
    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    const pythonPayload = {
      repetitions: card.repetitions,
      interval: card.interval,
      ease_factor: card.easeFactor,
      rating: rating
    };

    // Swapped hardcoded localhost for our production variable link string
    const pythonResponse = await axios.post(`${PYTHON_SERVICE_URL}/api/algorithm/review`, pythonPayload);
    
    const { repetitions, interval, easeFactor, nextReviewDate } = pythonResponse.data;

    card.repetitions = repetitions;
    card.interval = interval;
    card.easeFactor = easeFactor;
    card.nextReviewDate = new Date(nextReviewDate);

    const updatedCard = await card.save();
    res.status(200).json({ message: 'Review recorded successfully', card: updatedCard });

  } catch (error) {
    res.status(500).json({ message: 'Error processing review computation', error: error.message });
  }
});

// 5. UPLOAD LECTURE PDF FOR AUTOMATED GENERATION (Protected)
router.post('/upload-pdf', auth, upload.single('file'), async (req, res) => {
  try {
    const { deckId } = req.body;
    if (!req.file || !deckId) {
      return res.status(400).json({ message: 'Both a PDF file and a deckId are required.' });
    }

    const FormData = require('form-data');
    const formData = new FormData();
    
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname || 'document.pdf',
      contentType: req.file.mimetype || 'application/pdf'
    });

    // Swapped hardcoded localhost for our production variable link string
    const pythonResponse = await axios.post(`${PYTHON_SERVICE_URL}/api/parser/generate`, formData, {
      headers: {
        ...formData.getHeaders()
      }
    });

    const parsedCards = pythonResponse.data.cards;

    if (!parsedCards || parsedCards.length === 0) {
      return res.status(422).json({ message: 'No clear definition concepts could be extracted from this document structure.' });
    }

    const cardDocuments = parsedCards.map(c => ({
      deckId: deckId,
      front: c.front,
      back: c.back
    }));

    const savedCards = await Card.insertMany(cardDocuments);
    res.status(201).json({ message: `Successfully auto-generated ${savedCards.length} flashcards!`, cards: savedCards });

  } catch (error) {
    console.error('Parsing Error Context:', error.response?.data || error.message);
    res.status(500).json({ message: 'Internal parsing server failure', error: error.message });
  }
});

module.exports = router;