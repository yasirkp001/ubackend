const express = require('express');
const router = express.Router();
const store = require('../store');
const authMiddleware = require('../middleware/auth');

// Update profile details
router.put('/update', authMiddleware, async (req, res) => {
    const { name, phone, dp } = req.body;

    if (!name) {
        return res.status(400).json({ message: 'Name is required.' });
    }

    const user = store.users.find(u => u.id === req.user.id);
    if (!user) {
        return res.status(404).json({ message: 'User not found.' });
    }

    user.name = name;
    user.phone = phone || null;
    user.dp = dp || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
    
    try {
        await store.persist('users');
        res.json({ message: 'Profile details updated successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to save profile details.', error: err.message });
    }
});

module.exports = router;
