const express = require('express');
const router = express.Router();
const store = require('../store');

// Submit a new support inquiry
router.post('/tickets', (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ message: 'Name, email, and message are required.' });
    }

    const nextId = store.support_tickets.length > 0 ? Math.max(...store.support_tickets.map(t => t.id)) + 1 : 1;
    store.support_tickets.push({
        id: nextId,
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
        status: 'Open',
        reply: null,
        created_at: new Date().toISOString()
    });

    res.status(201).json({
        message: 'Support ticket submitted successfully.',
        ticketId: nextId
    });
});

module.exports = router;
