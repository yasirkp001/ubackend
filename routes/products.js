const express = require('express');
const router = express.Router();
const store = require('../store');

// Get all products
router.get('/', (req, res) => {
    try {
        // Ensure products have standard details and images arrays
        const products = store.products.map((p) => ({
            ...p,
            details: Array.isArray(p.details) ? p.details : (p.details ? JSON.parse(p.details) : []),
            images: Array.isArray(p.images) ? p.images : (p.images ? JSON.parse(p.images) : [p.image]),
            stock: p.stock !== undefined ? p.stock : 50
        }));
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// Get a single product
router.get('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const product = store.products.find(p => p.id === id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found.' });
        }

        // Return a copy with parsed fields to be safe and avoid mutating store directly
        const responseProduct = {
            ...product,
            details: Array.isArray(product.details) ? product.details : (product.details ? JSON.parse(product.details) : []),
            images: Array.isArray(product.images) ? product.images : (product.images ? JSON.parse(product.images) : [product.image]),
            stock: product.stock !== undefined ? product.stock : 50
        };

        res.json(responseProduct);
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

module.exports = router;
