const express = require('express');
const router = express.Router();
const store = require('../store');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

// Get all site settings (Public)
router.get('/', (req, res) => {
    try {
        res.json(store.site_settings);
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// Update site settings (Admin only)
router.put('/', authMiddleware, adminMiddleware, (req, res) => {
    const settings = req.body;
    
    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ message: 'Invalid settings format.' });
    }

    try {
        Object.entries(settings).forEach(([key, value]) => {
            store.site_settings[key] = String(value);
        });
        res.json({ message: 'Site settings updated successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update site settings.', error: err.message });
    }
});

module.exports = router;
