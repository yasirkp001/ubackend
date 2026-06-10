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
    const ticket = {
        id: nextId,
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
        status: 'Open',
        reply: null,
        created_at: new Date().toISOString()
    };
    store.support_tickets.push(ticket);

    // Save to backend live activities store
    store.addLiveActivity(
        'ticket-created',
        'New Support Inquiry',
        `Ticket #${nextId} opened by ${ticket.name} (${ticket.email}).`,
        '#f59e0b',
        '💬',
        nextId
    );

    // Broadcast real-time SSE ticket creation
    const sseService = require('../services/sseService');
    sseService.broadcast('ticket-created', { id: nextId, name: ticket.name, email: ticket.email, time: ticket.created_at });

    res.status(201).json({
        message: 'Support ticket submitted successfully.',
        ticketId: nextId
    });
});

module.exports = router;
