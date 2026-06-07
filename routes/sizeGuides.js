const express = require('express');
const router = express.Router();
const store = require('../store');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

// 1. Get all size guides (Public)
router.get('/', (req, res) => {
    try {
        res.json(store.size_guides);
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 2. Get size guide by category name (Public)
router.get('/category/:categoryName', (req, res) => {
    try {
        const catName = req.params.categoryName.trim();
        const guide = store.size_guides.find(
            g => g.category.toLowerCase() === catName.toLowerCase()
        );
        if (!guide) {
            return res.status(404).json({ message: 'Size guide not found for this category.' });
        }
        res.json(guide);
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 3. Create a size guide (Admin only)
router.post('/', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const { name, category, columns, slots } = req.body;

        if (!name || !name.trim() || !category || !category.trim()) {
            return res.status(400).json({ message: 'Name and Category are required.' });
        }

        // Check if a guide already exists for this category
        const exists = store.size_guides.some(
            g => g.category.toLowerCase() === category.trim().toLowerCase()
        );
        if (exists) {
            return res.status(400).json({ message: `A size guide for category "${category}" already exists.` });
        }

        const newId = store.size_guides.length > 0 ? Math.max(...store.size_guides.map(g => g.id)) + 1 : 1;
        const newGuide = {
            id: newId,
            name: name.trim(),
            category: category.trim(),
            columns: Array.isArray(columns) ? columns : [],
            slots: Array.isArray(slots) ? slots : []
        };

        store.size_guides.push(newGuide);

        res.status(201).json({
            message: 'Size guide created successfully.',
            sizeGuide: newGuide
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 4. Update a size guide (Admin only)
router.put('/:id', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { name, category, columns, slots } = req.body;

        if (!name || !name.trim() || !category || !category.trim()) {
            return res.status(400).json({ message: 'Name and Category are required.' });
        }

        const guide = store.size_guides.find(g => g.id === id);
        if (!guide) {
            return res.status(404).json({ message: 'Size guide not found.' });
        }

        // Check category unique constraint (excluding itself)
        const exists = store.size_guides.some(
            g => g.id !== id && g.category.toLowerCase() === category.trim().toLowerCase()
        );
        if (exists) {
            return res.status(400).json({ message: `A size guide for category "${category}" already exists.` });
        }

        guide.name = name.trim();
        guide.category = category.trim();
        guide.columns = Array.isArray(columns) ? columns : [];
        guide.slots = Array.isArray(slots) ? slots : [];

        res.json({
            message: 'Size guide updated successfully.',
            sizeGuide: guide
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 5. Delete a size guide (Admin only)
router.delete('/:id', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const index = store.size_guides.findIndex(g => g.id === id);
        if (index === -1) {
            return res.status(404).json({ message: 'Size guide not found.' });
        }

        store.size_guides.splice(index, 1);
        res.json({ message: 'Size guide deleted successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

module.exports = router;
