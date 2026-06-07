const express = require('express');
const router = express.Router();
const store = require('../store');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const emailService = require('../services/emailService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp|gif/;
        const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimeType = allowedTypes.test(file.mimetype);
        if (extName && mimeType) {
            cb(null, true);
        } else {
            cb(new Error('Only image files (jpg, jpeg, png, webp, gif) are allowed.'));
        }
    }
});

// Protect all admin routes
router.use(authMiddleware);
router.use(adminMiddleware);

// 0. Upload Image Endpoint
router.post('/upload', (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ message: `Upload error: ${err.message}` });
        } else if (err) {
            return res.status(400).json({ message: err.message });
        }
        
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }
        
        const imageUrl = `/uploads/${req.file.filename}`;
        res.json({ imageUrl });
    });
});

// 1. Get Analytics / Stats
router.get('/stats', (req, res) => {
    try {
        const totalSales = store.orders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
        const totalOrders = store.orders.length;
        const totalUsers = store.users.filter(u => u.role === 'customer').length;
        const totalProducts = store.products.length;

        res.json({
            totalSales,
            totalOrders,
            totalUsers,
            totalProducts
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching stats', error: err.message });
    }
});

// 2. List all users with LTV stats
router.get('/users', (req, res) => {
    try {
        const customers = store.users
            .filter(u => u.role === 'customer')
            .map(u => {
                const userOrders = store.orders.filter(o => o.user_id === u.id);
                const order_count = userOrders.length;
                const lifetime_value = userOrders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
                return {
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    role: u.role,
                    phone: u.phone || '',
                    created_at: u.created_at,
                    is_active: u.is_active,
                    order_count,
                    lifetime_value
                };
            })
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json(customers);
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 3. List all customer orders
router.get('/orders', (req, res) => {
    try {
        const formatted = store.orders
            .map(o => {
                const u = store.users.find(u => u.id === o.user_id) || {};
                const items = Array.isArray(o.items) ? o.items : (o.items ? JSON.parse(o.items) : []);
                return {
                    id: o.id,
                    userId: o.user_id,
                    total: o.total_amount,
                    status: o.status,
                    date: o.created_at,
                    paymentMethod: 'Card',
                    shippingDetails: {
                        address: o.address,
                        phone: o.phone,
                        email: u.email || '',
                        name: u.name || ''
                    },
                    items
                };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 4. Update order tracking status
router.put('/orders/:id', (req, res) => {
    try {
        const orderId = req.params.id;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ message: 'Status field is required.' });
        }

        const order = store.orders.find(o => o.id === orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found.' });
        }

        const oldStatus = order.status;
        order.status = status;

        if (status !== oldStatus) {
            try {
                const user = store.users.find(u => u.id === order.user_id) || {};
                const parsedItems = Array.isArray(order.items) ? order.items : (order.items ? JSON.parse(order.items) : []);
                emailService.sendStatusUpdateEmail(user.email || '', orderId, status, order.total_amount, parsedItems);
            } catch (e) {
                console.error('Failed to send status update email:', e.message);
            }
        }

        res.json({ message: 'Order status updated successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 5. Create product
router.post('/products', (req, res) => {
    try {
        const { name, price, category, image, description, details, care, images, stock, sizes } = req.body;

        if (!name || !price || !category || !image) {
            return res.status(400).json({ message: 'Name, price, category, and image are required.' });
        }

        const newId = store.products.length > 0 ? Math.max(...store.products.map(p => p.id)) + 1 : 1;
        const newProduct = {
            id: newId,
            name,
            price: parseFloat(price),
            category,
            image,
            description: description || '',
            details: Array.isArray(details) ? details : [],
            care: care || '',
            images: Array.isArray(images) ? images : [image],
            stock: stock !== undefined ? parseInt(stock, 10) : 50,
            sizes: Array.isArray(sizes) ? sizes : ['S', 'M', 'L', 'XL', 'XXL']
        };

        store.products.push(newProduct);

        res.status(201).json({
            message: 'Product created successfully.',
            productId: newId
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 6. Update product details
router.put('/products/:id', (req, res) => {
    try {
        const productId = parseInt(req.params.id, 10);
        const { name, price, category, image, description, details, care, images, stock, sizes } = req.body;

        if (!name || !price || !category || !image) {
            return res.status(400).json({ message: 'Name, price, category, and image are required.' });
        }

        const product = store.products.find(p => p.id === productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found.' });
        }

        product.name = name;
        product.price = parseFloat(price);
        product.category = category;
        product.image = image;
        product.description = description || '';
        product.details = Array.isArray(details) ? details : [];
        product.care = care || '';
        product.images = Array.isArray(images) ? images : [image];
        product.stock = stock !== undefined ? parseInt(stock, 10) : 50;
        product.sizes = Array.isArray(sizes) ? sizes : ['S', 'M', 'L', 'XL', 'XXL'];

        res.json({ message: 'Product updated successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 7. Delete product
router.delete('/products/:id', (req, res) => {
    try {
        const productId = parseInt(req.params.id, 10);
        const index = store.products.findIndex(p => p.id === productId);
        if (index === -1) {
            return res.status(404).json({ message: 'Product not found.' });
        }

        store.products.splice(index, 1);
        res.json({ message: 'Product deleted successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 8. List all coupons
router.get('/coupons', (req, res) => {
    try {
        const sortedCoupons = [...store.coupons].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json(sortedCoupons);
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 9. Create a coupon
router.post('/coupons', (req, res) => {
    try {
        const { code, discount_type, discount_value, min_purchase, active, expiry_date, usage_limit, category } = req.body;

        if (!code || !discount_type || discount_value === undefined) {
            return res.status(400).json({ message: 'Code, discount type, and discount value are required.' });
        }

        const uppercaseCode = code.trim().toUpperCase();
        const existing = store.coupons.find(c => c.code === uppercaseCode);
        if (existing) {
            return res.status(400).json({ message: 'Coupon code already exists.' });
        }

        const minPurchaseVal = min_purchase !== undefined ? parseFloat(min_purchase) : 0;
        const activeVal = active !== undefined ? (active ? 1 : 0) : 1;
        const usageLimitVal = usage_limit && parseInt(usage_limit, 10) > 0 ? parseInt(usage_limit, 10) : null;
        const categoryVal = category && category !== 'All' ? category.trim() : null;
        const expiryDateVal = expiry_date && expiry_date.trim() ? expiry_date.trim() : null;

        const newId = store.coupons.length > 0 ? Math.max(...store.coupons.map(c => c.id)) + 1 : 1;
        const newCoupon = {
            id: newId,
            code: uppercaseCode,
            discount_type,
            discount_value: parseFloat(discount_value),
            min_purchase: minPurchaseVal,
            active: activeVal,
            created_at: new Date().toISOString(),
            expiry_date: expiryDateVal,
            usage_limit: usageLimitVal,
            used_count: 0,
            category: categoryVal
        };

        store.coupons.push(newCoupon);

        res.status(201).json({
            message: 'Coupon created successfully.',
            couponId: newId
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 10. Delete a coupon
router.delete('/coupons/:id', (req, res) => {
    try {
        const couponId = parseInt(req.params.id, 10);
        const index = store.coupons.findIndex(c => c.id === couponId);
        if (index === -1) {
            return res.status(404).json({ message: 'Coupon not found.' });
        }

        store.coupons.splice(index, 1);
        res.json({ message: 'Coupon deleted successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 11. Toggle customer active status (block/unblock)
router.put('/users/:id/toggle-status', (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const user = store.users.find(u => u.id === userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        user.is_active = user.is_active === 0 ? 1 : 0;
        res.json({ message: `User status changed successfully.`, is_active: user.is_active });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 12. Get specific customer order history
router.get('/users/:id/orders', (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const userOrders = store.orders
            .filter(o => o.user_id === userId)
            .map(o => ({
                id: o.id,
                total_amount: o.total_amount,
                status: o.status,
                created_at: o.created_at
            }))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json(userOrders);
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 13. Update shipment tracking information
router.put('/orders/:id/tracking', (req, res) => {
    try {
        const orderId = req.params.id;
        const { courier, tracking_number, estimated_delivery } = req.body;

        const order = store.orders.find(o => o.id === orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found.' });
        }

        order.courier = courier;
        order.tracking_number = tracking_number;
        order.estimated_delivery = estimated_delivery;

        const user = store.users.find(u => u.id === order.user_id) || {};

        // Send tracking update email
        try {
            emailService.sendTrackingUpdateEmail(user.email || '', orderId, courier, tracking_number, estimated_delivery);
        } catch (emailErr) {
            console.error('Failed to send tracking confirmation email:', emailErr.message);
        }

        res.json({ message: 'Tracking details updated successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 14. List all support tickets
router.get('/support/tickets', (req, res) => {
    try {
        const tickets = [...store.support_tickets].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json(tickets);
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 15. Reply to support ticket
router.put('/support/tickets/:id/reply', (req, res) => {
    try {
        const ticketId = parseInt(req.params.id, 10);
        const { reply } = req.body;

        if (!reply) {
            return res.status(400).json({ message: 'Reply content is required.' });
        }

        const ticket = store.support_tickets.find(t => t.id === ticketId);
        if (!ticket) {
            return res.status(404).json({ message: 'Support ticket not found.' });
        }

        ticket.reply = reply;
        ticket.status = 'Resolved';

        // Send email reply to customer
        try {
            emailService.sendSupportReplyEmail(ticket.email, ticket.name, ticket.message, reply);
        } catch (emailErr) {
            console.error('Failed to send support response email:', emailErr.message);
        }

        res.json({ message: 'Support reply sent successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 16. Get sales dashboard analytics
router.get('/analytics', (req, res) => {
    try {
        const orders = store.orders;

        // Aggregate statistics in memory
        let totalRevenue = 0;
        let refundedRevenue = 0;
        let cancelledRevenue = 0;
        let successfulOrders = 0;
        let totalOrders = orders.length;

        // Daily trend
        const dailyTrend = {}; // 'YYYY-MM-DD': { dateStr, sales, count }
        
        // Category sales
        const categorySales = {}; // 'CategoryName': salesAmount
        
        // Product leaderboard
        const productSales = {}; // 'productId': { id, name, qty, revenue, image }

        orders.forEach(order => {
            const dateStr = order.created_at.split(' ')[0].split('T')[0];
            const amount = parseFloat(order.total_amount || 0);

            // Setup daily trend entry
            if (!dailyTrend[dateStr]) {
                dailyTrend[dateStr] = { dateStr, sales: 0, count: 0 };
            }

            if (order.status === 'Cancelled') {
                cancelledRevenue += amount;
            } else if (order.status === 'Refunded' || order.status === 'Returned') {
                refundedRevenue += amount;
                dailyTrend[dateStr].sales += amount; // Include in trends but note refund
                dailyTrend[dateStr].count += 1;
            } else {
                totalRevenue += amount;
                successfulOrders += 1;
                dailyTrend[dateStr].sales += amount;
                dailyTrend[dateStr].count += 1;

                // Aggregate product sales
                try {
                    const items = Array.isArray(order.items) ? order.items : (order.items ? JSON.parse(order.items) : []);
                    if (Array.isArray(items)) {
                        items.forEach(item => {
                            const itemId = item.id || item.productId || item.product_id;
                            if (itemId) {
                                if (!productSales[itemId]) {
                                    productSales[itemId] = {
                                        id: itemId,
                                        name: item.name || 'Unknown Item',
                                        qty: 0,
                                        revenue: 0,
                                        image: item.image || ''
                                    };
                                }
                                const qty = parseInt(item.quantity || 1, 10);
                                const itemPrice = parseFloat(item.price || 0);
                                productSales[itemId].qty += qty;
                                productSales[itemId].revenue += itemPrice * qty;
                            }
                        });
                    }
                } catch (e) {
                    console.error('Failed to parse order items JSON during analytics aggregation:', e.message);
                }
            }
        });

        // Compute average order value (AOV)
        const netRevenue = totalRevenue;
        const averageOrderValue = successfulOrders > 0 ? netRevenue / successfulOrders : 0;

        // Convert structures to sorted arrays
        const salesTrend = Object.values(dailyTrend).sort((a, b) => a.dateStr.localeCompare(b.dateStr)).slice(-30); // Last 30 active days
        const leaderboard = Object.values(productSales).sort((a, b) => b.qty - a.qty).slice(0, 5); // Top 5 best sellers

        res.json({
            summary: {
                totalRevenue,
                refundedRevenue,
                cancelledRevenue,
                netRevenue,
                totalOrders,
                successfulOrders,
                averageOrderValue
            },
            salesTrend,
            leaderboard
        });
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch orders for analytics.', error: err.message });
    }
});

// 17. Bulk Update Product Inventory
router.post('/products/bulk-inventory', (req, res) => {
    try {
        const { action, amount, category, selectedProducts } = req.body;

        if (!action || !amount) {
            return res.status(400).json({ message: 'Action (set/add) and amount are required.' });
        }

        const val = parseInt(amount, 10);
        if (isNaN(val)) {
            return res.status(400).json({ message: 'Amount must be an integer.' });
        }

        let updatedCount = 0;
        store.products.forEach(p => {
            let shouldUpdate = false;
            if (category && category !== 'All') {
                if (p.category === category) {
                    shouldUpdate = true;
                }
            } else if (Array.isArray(selectedProducts) && selectedProducts.length > 0) {
                if (selectedProducts.includes(p.id)) {
                    shouldUpdate = true;
                }
            } else {
                // Update all products
                shouldUpdate = true;
            }

            if (shouldUpdate) {
                if (action === 'set') {
                    p.stock = val;
                } else if (action === 'add') {
                    p.stock = Math.max(0, (p.stock || 0) + val);
                }
                updatedCount++;
            }
        });

        res.json({ message: `Successfully updated stock for ${updatedCount} products.` });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update stock in bulk.', error: err.message });
    }
});

module.exports = router;
