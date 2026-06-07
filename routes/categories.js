const express = require('express');
const router = express.Router();
const store = require('../store');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

// 1. Get all categories (Public)
router.get('/', (req, res) => {
    const list = [...store.categories].sort((a, b) => a.name.localeCompare(b.name));
    res.json(list);
});

// 2. Add category (Admin only)
router.post('/admin', authMiddleware, adminMiddleware, (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Category name is required.' });
    }

    const trimmedName = name.trim();

    const exists = store.categories.some(c => c.name.toLowerCase() === trimmedName.toLowerCase());
    if (exists) {
        return res.status(400).json({ message: 'Category already exists.' });
    }

    const nextId = store.categories.length > 0 ? Math.max(...store.categories.map(c => c.id)) + 1 : 1;
    const newCategory = {
        id: nextId,
        name: trimmedName,
        created_at: new Date().toISOString()
    };
    store.categories.push(newCategory);
    res.status(201).json({ message: 'Category created successfully.', id: nextId, name: trimmedName });
});

// 3. Delete category (Admin only)
router.delete('/admin/:id', authMiddleware, adminMiddleware, (req, res) => {
    const catId = parseInt(req.params.id, 10);

    const index = store.categories.findIndex(c => c.id === catId);
    if (index === -1) {
        return res.status(404).json({ message: 'Category not found.' });
    }

    store.categories.splice(index, 1);
    res.json({ message: 'Category deleted successfully.' });
});

module.exports = router;
