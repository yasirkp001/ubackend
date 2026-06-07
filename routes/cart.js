const express = require('express');
const router = express.Router();
const store = require('../store');
const authMiddleware = require('../middleware/auth');

// Protect all cart routes
router.use(authMiddleware);

// Get all cart items for current user
router.get('/', (req, res) => {
    const userId = req.user.id;
    const userCart = store.cart_items
        .filter(c => c.user_id === userId)
        .map(c => {
            const p = store.products.find(prod => prod.id === c.product_id);
            return {
                id: p ? p.id : c.product_id,
                name: p ? p.name : 'Unknown Product',
                price: p ? p.price : 0,
                image: p ? p.image : '',
                size: c.size,
                quantity: c.quantity
            };
        });
    res.json(userCart);
});

// Add item to cart or increment quantity
router.post('/', (req, res) => {
    const userId = req.user.id;
    const { product_id, size, quantity } = req.body;

    if (!product_id || !size) {
        return res.status(400).json({ message: 'product_id and size are required.' });
    }

    const qty = quantity || 1;
    const targetProdId = parseInt(product_id, 10);
    const existingItem = store.cart_items.find(
        c => c.user_id === userId && c.product_id === targetProdId && c.size === size
    );

    if (existingItem) {
        existingItem.quantity += qty;
    } else {
        const nextId = store.cart_items.length > 0 ? Math.max(...store.cart_items.map(c => c.id)) + 1 : 1;
        store.cart_items.push({
            id: nextId,
            user_id: userId,
            product_id: targetProdId,
            size,
            quantity: qty
        });
    }
    res.json({ message: 'Item added to cart successfully.' });
});

// Update item quantity
router.put('/quantity', (req, res) => {
    const userId = req.user.id;
    const { product_id, size, quantity } = req.body;

    if (!product_id || !size || quantity === undefined) {
        return res.status(400).json({ message: 'product_id, size and quantity are required.' });
    }

    if (quantity < 1) {
        return res.status(400).json({ message: 'Quantity must be at least 1.' });
    }

    const targetProdId = parseInt(product_id, 10);
    const item = store.cart_items.find(
        c => c.user_id === userId && c.product_id === targetProdId && c.size === size
    );
    if (!item) {
        return res.status(404).json({ message: 'Cart item not found.' });
    }

    item.quantity = quantity;
    res.json({ message: 'Quantity updated successfully.' });
});

// Update item size (with potential merge if target size already exists)
router.put('/size', (req, res) => {
    const userId = req.user.id;
    const { product_id, oldSize, newSize } = req.body;

    if (!product_id || !oldSize || !newSize) {
        return res.status(400).json({ message: 'product_id, oldSize and newSize are required.' });
    }

    if (oldSize === newSize) {
        return res.json({ message: 'Sizes are identical, no update needed.' });
    }

    const targetProdId = parseInt(product_id, 10);
    const existingNewItem = store.cart_items.find(
        c => c.user_id === userId && c.product_id === targetProdId && c.size === newSize
    );
    const oldItemIndex = store.cart_items.findIndex(
        c => c.user_id === userId && c.product_id === targetProdId && c.size === oldSize
    );

    if (oldItemIndex === -1) {
        return res.status(404).json({ message: 'Original cart item not found.' });
    }

    const oldItem = store.cart_items[oldItemIndex];

    if (existingNewItem) {
        // Merge: update newSize quantity, delete oldSize row
        existingNewItem.quantity += oldItem.quantity;
        store.cart_items.splice(oldItemIndex, 1);
        res.json({ message: 'Cart items merged successfully.' });
    } else {
        // Just update size
        oldItem.size = newSize;
        res.json({ message: 'Size updated successfully.' });
    }
});

// Clear entire cart
router.delete('/clear', (req, res) => {
    const userId = req.user.id;
    for (let i = store.cart_items.length - 1; i >= 0; i--) {
        if (store.cart_items[i].user_id === userId) {
            store.cart_items.splice(i, 1);
        }
    }
    res.json({ message: 'Cart cleared successfully.' });
});

// Remove item from cart
router.delete('/:product_id', (req, res) => {
    const userId = req.user.id;
    const productId = parseInt(req.params.product_id, 10);
    const { size } = req.query;

    if (!size) {
        return res.status(400).json({ message: 'size query parameter is required.' });
    }

    const itemIndex = store.cart_items.findIndex(
        c => c.user_id === userId && c.product_id === productId && c.size === size
    );
    if (itemIndex === -1) {
        return res.status(404).json({ message: 'Item not found in cart.' });
    }

    store.cart_items.splice(itemIndex, 1);
    res.json({ message: 'Item removed from cart.' });
});

module.exports = router;
