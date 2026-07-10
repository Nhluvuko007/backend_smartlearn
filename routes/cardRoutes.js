const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() }); // Keep file inside transient memory
const Card = require('../models/Card');
const axios = require('axios');

// 1. CREATE a flashcard inside a deck
router.post('/', async (req, res) => {
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

// 2. GET ALL flashcards belonging to a specific deck
router.get('/deck/:deckId', async (req, res) => {
  try {
    const { deckId } = req.params;
    const cards = await Card.find({ deckId });
    res.status(200).json(cards);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching cards for this deck', error: error.message });
  }
});

// 3. GET DUE CARDS (The Smart Study Queue)
// Grabs cards where nextReviewDate is less than or equal to right now
router.get('/deck/:deckId/study', async (req, res) => {
  try {
    const { deckId } = req.params;
    const rightNow = new Date();

    const dueCards = await Card.find({
      deckId: deckId,
      nextReviewDate: { $lte: rightNow } // Filter: nextReviewDate <= current time
    });

    res.status(200).json(dueCards);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching study queue', error: error.message });
  }
});

// 4. SUBMIT CARD REVIEW (Talks to Python Microservice)
router.post('/:cardId/review', async (req, res) => {
  try {
    const { cardId } = req.params;
    const { rating } = req.body; // Expects 1, 2, 3, or 4 from Frontend

    if (!rating || rating < 1 || rating > 4) {
      return res.status(400).json({ message: 'Valid review rating (1-4) is required.' });
    }

    // Step A: Find the card's current state inside MongoDB
    const card = await Card.findById(cardId);
    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    // Step B: Direct message payload to Python microservice
    const pythonPayload = {
      repetitions: card.repetitions,
      interval: card.interval,
      ease_factor: card.easeFactor,
      rating: rating
    };

    const pythonResponse = await axios.post('http://127.0.0.1:8000/api/algorithm/review', pythonPayload);
    
    // Extract calculated math fields directly from Python's response
    const { repetitions, interval, easeFactor, nextReviewDate } = pythonResponse.data;

    // Step C: Update our card document inside MongoDB with new calculations
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

// 5. UPLOAD LECTURE PDF FOR AUTOMATED GENERATION
router.post('/upload-pdf', upload.single('file'), async (req, res) => {
  try {
    const { deckId } = req.body;
    if (!req.file || !deckId) {
      return res.status(400).json({ message: 'Both a PDF file and a deckId are required.' });
    }

    const FormData = require('form-data');
    const formData = new FormData();
    
    // Pass explicit filename and content-type options to make it fully compliant
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname || 'document.pdf',
      contentType: req.file.mimetype || 'application/pdf'
    });

    // Send to Python Engine
    const pythonResponse = await axios.post('http://127.0.0.1:8000/api/parser/generate', formData, {
      headers: {
        ...formData.getHeaders()
      }
    });

    const parsedCards = pythonResponse.data.cards;

    if (!parsedCards || parsedCards.length === 0) {
      return res.status(422).json({ message: 'No clear definition concepts could be extracted from this document structure.' });
    }

    // Save records down into MongoDB
    const cardDocuments = parsedCards.map(c => ({
      deckId: deckId,
      front: c.front,
      back: c.back
    }));

    const savedCards = await Card.insertMany(cardDocuments);
    res.status(201).json({ message: `Successfully auto-generated ${savedCards.length} flashcards!`, cards: savedCards });

  } catch (error) {
    // Detailed logging so we know exactly where it broke (Axios vs Database)
    console.error('Parsing Error Context:', error.response?.data || error.message);
    res.status(500).json({ message: 'Internal parsing server failure', error: error.message });
  }
});

module.exports = router;