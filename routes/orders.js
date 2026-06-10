const express = require('express');
const router = express.Router();
const store = require('../store');
const authMiddleware = require('../middleware/auth');
const sseService = require('../services/sseService');

// Protect all order routes
router.use(authMiddleware);

// Get all orders for the current user
router.get('/', (req, res) => {
    const userId = req.user.id;
    const userOrders = store.orders
        .filter(o => o.user_id === userId)
        .map(row => ({
            id: row.id,
            date: row.created_at,
            total: row.total_amount,
            status: row.status,
            paymentMethod: 'Card',
            items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
            shippingDetails: {
                address: row.address,
                phone: row.phone
            },
            trackingNumber: row.tracking_number,
            courier: row.courier,
            estimatedDelivery: row.estimated_delivery
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(userOrders);
});

// Create a new order (from checkout)
router.post('/', (req, res) => {
    const userId = req.user.id;
    const { id, total, paymentMethod, shippingDetails, items, promoCode, discount } = req.body;

    if (!id || !total || !items || !shippingDetails) {
        return res.status(400).json({ message: 'Missing order details.' });
    }

    const address = `${shippingDetails.firstName || ''} ${shippingDetails.lastName || ''}, ${shippingDetails.address || ''}, ${shippingDetails.city || ''}, ${shippingDetails.zipCode || ''}`;
    const phone = shippingDetails.phone || '';

    // Insert order
    store.orders.push({
        id,
        user_id: userId,
        total_amount: total,
        status: 'Confirmed',
        address,
        phone,
        items: Array.isArray(items) ? items : JSON.parse(items),
        promo_code: promoCode || null,
        discount_amount: discount || 0,
        created_at: new Date().toISOString(),
        tracking_number: null,
        courier: null,
        estimated_delivery: null
    });

    // If promoCode was used, increment used_count
    if (promoCode) {
        const coupon = store.coupons.find(c => c.code.toUpperCase() === promoCode.toUpperCase());
        if (coupon) {
            coupon.used_count = (coupon.used_count || 0) + 1;
        }
    }

    // Clear cart for the user
    for (let i = store.cart_items.length - 1; i >= 0; i--) {
        if (store.cart_items[i].user_id === userId) {
            store.cart_items.splice(i, 1);
        }
    }

    // Broadcast the new order event to all connected admin panels
    try {
        const user = store.users.find(u => u.id === userId) || {};
        const parsedItems = Array.isArray(items) ? items : JSON.parse(items);
        sseService.broadcast('new-order', {
            id,
            total,
            customerName: user.name || `${shippingDetails.firstName || ''} ${shippingDetails.lastName || ''}`.trim() || 'Guest Customer',
            itemsCount: parsedItems.length
        });
    } catch (sseErr) {
        console.error('Failed to broadcast new order via SSE:', sseErr.message);
    }

    res.status(201).json({ message: 'Order placed successfully.', orderId: id });
});

// Cancel/Delete an order
router.delete('/:id', (req, res) => {
    const userId = req.user.id;
    const orderId = req.params.id;

    const orderIndex = store.orders.findIndex(o => o.id === orderId && o.user_id === userId);
    if (orderIndex === -1) {
        return res.status(404).json({ message: 'Order not found or unauthorized.' });
    }

    store.orders.splice(orderIndex, 1);
    res.json({ message: 'Order cancelled successfully.' });
});

// Get all active coupons (for checkout / customer account page)
router.get('/coupons/active', (req, res) => {
    const activeCoupons = store.coupons
        .filter(c => c.active === 1)
        .map(c => ({
            code: c.code,
            discount_type: c.discount_type,
            discount_value: c.discount_value,
            min_purchase: c.min_purchase
        }));
    res.json(activeCoupons);
});

// Validate coupon code
router.get('/coupons/validate/:code', (req, res) => {
    const userId = req.user.id;
    const code = req.params.code.trim().toUpperCase();

    const coupon = store.coupons.find(c => c.code.toUpperCase() === code && c.active === 1);
    if (!coupon) {
        return res.status(404).json({ message: 'Invalid or expired coupon code.' });
    }

    // 1. Expiration check
    if (coupon.expiry_date) {
        const expiry = new Date(coupon.expiry_date);
        const now = new Date();
        if (now > expiry) {
            return res.status(400).json({ message: 'Coupon code has expired.' });
        }
    }

    // 2. Usage limit check
    if (coupon.usage_limit !== null && coupon.usage_limit !== undefined && coupon.usage_limit > 0) {
        if ((coupon.used_count || 0) >= coupon.usage_limit) {
            return res.status(400).json({ message: 'Coupon usage limit has been reached.' });
        }
    }

    // 3. Category constraint check
    if (coupon.category && coupon.category !== 'All') {
        const userCartItems = store.cart_items
            .filter(c => c.user_id === userId)
            .map(c => {
                const p = store.products.find(prod => prod.id === c.product_id);
                return p || {};
            });

        const hasCategoryItem = userCartItems.some(item => item.category === coupon.category);
        if (!hasCategoryItem) {
            return res.status(400).json({ message: `Coupon is only valid for products in the "${coupon.category}" category.` });
        }
    }

    return res.json({
        valid: true,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        min_purchase: coupon.min_purchase,
        category: coupon.category,
        expiry_date: coupon.expiry_date,
        usage_limit: coupon.usage_limit
    });
});

// Request a return for an order
router.put('/:id/return', (req, res) => {
    const userId = req.user.id;
    const orderId = req.params.id;

    const order = store.orders.find(o => o.id === orderId && o.user_id === userId);
    if (!order) {
        return res.status(404).json({ message: 'Order not found.' });
    }

    // Only allow returns for Delivered orders
    if (order.status !== 'Delivered') {
        return res.status(400).json({ message: 'Only delivered orders can be returned.' });
    }

    order.status = "Return Requested";
    res.json({ message: 'Return requested successfully.', status: 'Return Requested' });
});

module.exports = router;
