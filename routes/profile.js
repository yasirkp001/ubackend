const express = require('express');
const router = express.Router();
const store = require('../store');
const authMiddleware = require('../middleware/auth');

// Update profile details
router.put('/update', authMiddleware, (req, res) => {
    const { name, phone } = req.body;

    if (!name) {
        return res.status(400).json({ message: 'Name is required.' });
    }

    const user = store.users.find(u => u.id === req.user.id);
    if (!user) {
        return res.status(404).json({ message: 'User not found.' });
    }

    user.name = name;
    user.phone = phone || null;
    res.json({ message: 'Profile details updated successfully.' });
});

module.exports = router;
