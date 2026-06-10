const express = require('express');
const router = express.Router();
const store = require('../store');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const jwt = require('jsonwebtoken');

// 1. GET /api/reviews - Fetch reviews (filtered by productId if provided)
router.get('/', (req, res) => {
    try {
        const productId = req.query.productId ? parseInt(req.query.productId, 10) : null;
        let list = store.reviews;

        if (productId) {
            list = list.filter(r => r.product_id === productId);
        }

        // Check if requester is authenticated (to show their own pending reviews) or admin
        let requesterEmail = null;
        let isAdmin = false;
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecret_key_uclose_ecommerce_jwt_token_2026');
                if (decoded && decoded.id) {
                    const user = store.users.find(u => u.id === decoded.id);
                    if (user) {
                        requesterEmail = user.email.toLowerCase();
                        if (user.role === 'admin') {
                            isAdmin = true;
                        }
                    }
                }
            } catch (e) {
                // Ignore, keep isAdmin = false
            }
        }

        if (!isAdmin) {
            // Regular customers see approved reviews OR their own review (even if pending)
            list = list.filter(r => r.approved === 1 || r.approved === true || (requesterEmail && r.email.toLowerCase() === requesterEmail));
        }

        // Sort newest first
        list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json(list);
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 2. POST /api/reviews - Submit review (authenticated customers)
router.post('/', authMiddleware, (req, res) => {
    try {
        const { product_id, rating, comment } = req.body;
        if (!product_id || rating === undefined || !comment) {
            return res.status(400).json({ message: 'product_id, rating, and comment are required.' });
        }

        const ratingVal = parseInt(rating, 10);
        if (isNaN(ratingVal) || ratingVal < 1 || ratingVal > 5) {
            return res.status(400).json({ message: 'Rating must be an integer between 1 and 5.' });
        }

        // Find user details from store using req.user.id
        const user = store.users.find(u => u.id === req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const targetProductId = parseInt(product_id, 10);
        // Check if user has already reviewed this product
        const existingReview = store.reviews.find(r => r.product_id === targetProductId && r.email.toLowerCase() === user.email.toLowerCase());

        if (existingReview) {
            existingReview.rating = ratingVal;
            existingReview.comment = comment.trim();
            existingReview.approved = 0; // Reset to pending approval
            existingReview.created_at = new Date().toISOString();
            
            return res.json({
                message: 'Review updated successfully and is pending moderation.',
                review: existingReview
            });
        }

        const newId = store.reviews.length > 0 ? Math.max(...store.reviews.map(r => r.id)) + 1 : 1;
        const newReview = {
            id: newId,
            product_id: targetProductId,
            name: user.name,
            email: user.email,
            rating: ratingVal,
            comment: comment.trim(),
            approved: 0, // Pending admin approval
            created_at: new Date().toISOString()
        };

        store.reviews.push(newReview);
        res.status(201).json({ message: 'Review submitted for moderation.', review: newReview });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 3. PUT /api/reviews/:id/approve - Approve review (admin only)
router.put('/:id/approve', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const review = store.reviews.find(r => r.id === id);
        if (!review) {
            return res.status(404).json({ message: 'Review not found.' });
        }

        review.approved = 1;
        res.json({ message: 'Review approved successfully.', review });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 4. DELETE /api/reviews/:id - Delete review (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const index = store.reviews.findIndex(r => r.id === id);
        if (index === -1) {
            return res.status(404).json({ message: 'Review not found.' });
        }

        store.reviews.splice(index, 1);
        res.json({ message: 'Review deleted successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 5. PUT /api/reviews/:id - Update review (admin only)
router.put('/:id', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { rating, comment } = req.body;
        const review = store.reviews.find(r => r.id === id);
        if (!review) {
            return res.status(404).json({ message: 'Review not found.' });
        }

        if (rating !== undefined) {
            const ratingVal = parseInt(rating, 10);
            if (isNaN(ratingVal) || ratingVal < 1 || ratingVal > 5) {
                return res.status(400).json({ message: 'Rating must be an integer between 1 and 5.' });
            }
            review.rating = ratingVal;
        }

        if (comment !== undefined) {
            review.comment = comment.trim();
        }

        res.json({ message: 'Review updated successfully.', review });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

module.exports = router;
