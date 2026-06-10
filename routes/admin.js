const express = require('express');
const router = express.Router();
const store = require('../store');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const sseService = require('../services/sseService');
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
        const usersList = store.users
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
                    dp: u.dp || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.name || 'User')}`,
                    created_at: u.created_at,
                    is_active: u.is_active,
                    order_count: u.role === 'admin' ? null : order_count,
                    lifetime_value: u.role === 'admin' ? null : lifetime_value
                };
            })
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json(usersList);
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 2.5. Create a new Administrator
router.post('/users/create-admin', async (req, res) => {
    try {
        const { name, email, password, phone, dp } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email, and password are required.' });
        }

        const existingUser = store.users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (existingUser) {
            return res.status(400).json({ message: 'A user or admin already exists with this email.' });
        }

        const bcrypt = require('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUserId = store.users.length > 0 ? Math.max(...store.users.map(u => u.id)) + 1 : 1;
        const newAdmin = {
            id: newUserId,
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password_hash: passwordHash,
            role: 'admin',
            phone: phone || '',
            dp: dp || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || 'Admin')}`,
            created_at: new Date().toISOString(),
            is_active: 1
        };

        store.users.push(newAdmin);
        store.logActivity(req.user.id, 'Admin Created', `New administrator "${newAdmin.name}" (${newAdmin.email}) was created.`);
        res.status(201).json({ message: 'Administrator created successfully.', user: { id: newAdmin.id, name: newAdmin.name, email: newAdmin.email, role: newAdmin.role } });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 2.7. Create a new Customer / User
router.post('/users/create-customer', async (req, res) => {
    try {
        const { name, email, password, phone, dp } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email, and password are required.' });
        }

        const existingUser = store.users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (existingUser) {
            return res.status(400).json({ message: 'A user already exists with this email.' });
        }

        const bcrypt = require('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUserId = store.users.length > 0 ? Math.max(...store.users.map(u => u.id)) + 1 : 1;
        const newCustomer = {
            id: newUserId,
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password_hash: passwordHash,
            role: 'customer',
            phone: phone || '',
            dp: dp || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || 'User')}`,
            created_at: new Date().toISOString(),
            is_active: 1
        };

        store.users.push(newCustomer);
        store.logActivity(req.user.id, 'Customer Created', `New customer "${newCustomer.name}" (${newCustomer.email}) was created.`);
        res.status(201).json({ message: 'Customer created successfully.', user: { id: newCustomer.id, name: newCustomer.name, email: newCustomer.email, role: newCustomer.role } });
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
                    items,
                    promoCode: o.promo_code || null,
                    discount: o.discount_amount || 0,
                    adminNotes: o.admin_notes || ''
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
            store.logActivity(req.user.id, 'Order Status Changed', `Order #${orderId} moved from "${oldStatus}" to "${status}".`);
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
        store.logActivity(req.user.id, 'Product Created', `Product "${name}" (#${newId}) was added to the catalog.`);

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

        store.logActivity(req.user.id, 'Product Updated', `Product "${product.name}" (#${productId}) was updated.`);
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

        const removedProduct = store.products.splice(index, 1)[0];
        store.logActivity(req.user.id, 'Product Deleted', `Product "${removedProduct.name}" (#${productId}) was deleted.`);
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
        store.logActivity(req.user.id, 'Coupon Created', `Coupon "${uppercaseCode}" was created.`);

        res.status(201).json({
            message: 'Coupon created successfully.',
            couponId: newId
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 9.5. Update a coupon (edit fields or toggle active status)
router.put('/coupons/:id', (req, res) => {
    try {
        const couponId = parseInt(req.params.id, 10);
        const coupon = store.coupons.find(c => c.id === couponId);
        if (!coupon) {
            return res.status(404).json({ message: 'Coupon not found.' });
        }

        const { code, discount_type, discount_value, min_purchase, active, expiry_date, usage_limit, category } = req.body;

        if (code !== undefined) {
            const uppercaseCode = code.trim().toUpperCase();
            const duplicate = store.coupons.find(c => c.code === uppercaseCode && c.id !== couponId);
            if (duplicate) {
                return res.status(400).json({ message: 'Another coupon already uses this code.' });
            }
            coupon.code = uppercaseCode;
        }
        if (discount_type !== undefined) coupon.discount_type = discount_type;
        if (discount_value !== undefined) coupon.discount_value = parseFloat(discount_value);
        if (min_purchase !== undefined) coupon.min_purchase = parseFloat(min_purchase) || 0;
        if (active !== undefined) coupon.active = active ? 1 : 0;
        if (expiry_date !== undefined) coupon.expiry_date = expiry_date && String(expiry_date).trim() ? String(expiry_date).trim() : null;
        if (usage_limit !== undefined) coupon.usage_limit = usage_limit && parseInt(usage_limit, 10) > 0 ? parseInt(usage_limit, 10) : null;
        if (category !== undefined) coupon.category = category && category !== 'All' ? category.trim() : null;

        store.logActivity(req.user.id, 'Coupon Updated', `Coupon "${coupon.code}" was ${active !== undefined && Object.keys(req.body).length === 1 ? (coupon.active ? 'activated' : 'deactivated') : 'updated'}.`);
        res.json({ message: 'Coupon updated successfully.', coupon });
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

        const removed = store.coupons.splice(index, 1)[0];
        store.logActivity(req.user.id, 'Coupon Deleted', `Coupon "${removed.code}" was deleted.`);
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
        store.logActivity(req.user.id, 'User Status Changed', `User "${user.name}" was ${user.is_active ? 'unblocked' : 'blocked'}.`);
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

        store.logActivity(req.user.id, 'Tracking Updated', `Shipment tracking set on order #${orderId} (${courier}: ${tracking_number}).`);

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
        store.logActivity(req.user.id, 'Support Reply Sent', `Replied to support ticket #${ticketId} from ${ticket.name}.`);

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

        store.logActivity(req.user.id, 'Bulk Inventory Update', `Stock ${action === 'set' ? 'set to' : 'adjusted by'} ${val} for ${updatedCount} products${category && category !== 'All' ? ` in "${category}"` : ''}.`);
        res.json({ message: `Successfully updated stock for ${updatedCount} products.` });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update stock in bulk.', error: err.message });
    }
});

// 17.5. Update user details
router.put('/users/:id', (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { name, phone, dp } = req.body;
        const user = store.users.find(u => u.id === userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (name) user.name = name;
        if (phone !== undefined) user.phone = phone || '';
        if (dp !== undefined) user.dp = dp || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name || 'User')}`;

        res.json({ message: 'User details updated successfully.', user });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 17.55. Delete a customer account
router.delete('/users/:id', (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const index = store.users.findIndex(u => u.id === userId);

        if (index === -1) {
            return res.status(404).json({ message: 'User not found.' });
        }
        if (userId === req.user.id) {
            return res.status(400).json({ message: 'You cannot delete your own account.' });
        }
        if (store.users[index].role === 'admin') {
            return res.status(400).json({ message: 'Administrator accounts cannot be deleted from here.' });
        }

        const removed = store.users.splice(index, 1)[0];

        // Clean up the deleted customer's cart (order history is kept for records)
        for (let i = store.cart_items.length - 1; i >= 0; i--) {
            if (store.cart_items[i].user_id === userId) store.cart_items.splice(i, 1);
        }

        store.logActivity(req.user.id, 'Customer Deleted', `Customer "${removed.name}" (${removed.email}) was permanently deleted.`);
        res.json({ message: 'Customer deleted successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 17.56. View live customer carts (potential revenue not yet checked out)
router.get('/carts', (req, res) => {
    try {
        const cartsByUser = {};
        store.cart_items.forEach(c => {
            const user = store.users.find(u => u.id === c.user_id);
            if (!user) return;
            const product = store.products.find(p => p.id === c.product_id);
            if (!cartsByUser[c.user_id]) {
                cartsByUser[c.user_id] = {
                    user_id: c.user_id,
                    name: user.name,
                    email: user.email,
                    dp: user.dp || '',
                    items: [],
                    item_count: 0,
                    total_value: 0
                };
            }
            const price = product ? parseFloat(product.price) || 0 : 0;
            cartsByUser[c.user_id].items.push({
                product_id: c.product_id,
                name: product ? product.name : 'Unknown Product',
                image: product ? product.image : '',
                size: c.size,
                quantity: c.quantity,
                price
            });
            cartsByUser[c.user_id].item_count += c.quantity;
            cartsByUser[c.user_id].total_value += price * c.quantity;
        });

        const carts = Object.values(cartsByUser).sort((a, b) => b.total_value - a.total_value);
        res.json(carts);
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 17.6. Change own admin password
router.put('/change-password', async (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({ message: 'Current and new passwords are required.' });
        }
        if (new_password.length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters long.' });
        }

        const user = store.users.find(u => u.id === req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const bcrypt = require('bcryptjs');
        const isMatch = await bcrypt.compare(current_password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect.' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password_hash = await bcrypt.hash(new_password, salt);

        store.logActivity(req.user.id, 'Password Changed', 'Admin account password was changed.');
        
        // Save to backend live activities store
        store.addLiveActivity(
            'password-changed',
            'Admin Password Changed',
            `Administrator ${user.name} (${user.email}) changed their password.`,
            '#f43f5e',
            '🔒'
        );

        // Broadcast real-time SSE password change notification
        try {
            const sseService = require('../services/sseService');
            sseService.broadcast('password-changed', {
                name: user.name,
                email: user.email,
                role: 'admin',
                time: new Date().toISOString()
            });
        } catch (sseErr) {
            console.error('Failed to broadcast password-changed via SSE:', sseErr.message);
        }

        res.json({ message: 'Password changed successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 17.7. Save internal admin notes on an order
router.put('/orders/:id/notes', (req, res) => {
    try {
        const order = store.orders.find(o => o.id === req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found.' });
        }

        order.admin_notes = req.body.notes || '';
        store.logActivity(req.user.id, 'Order Notes Updated', `Internal notes saved on order #${order.id}.`);
        res.json({ message: 'Order notes saved successfully.', adminNotes: order.admin_notes });
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 17.8. Get admin activity log
router.get('/activity', (req, res) => {
    try {
        res.json(store.activities);
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 17.9. Get backend live activities log
router.get('/live-activities', (req, res) => {
    try {
        res.json(store.live_activities);
    } catch (err) {
        res.status(500).json({ message: 'Server error.', error: err.message });
    }
});

// 18. Expose SSE stream route for real-time notifications
router.get('/order-stream', (req, res) => {
    sseService.registerClient(req, res);
});

// 19. Get List of Uploaded Media Assets (Admin only)
router.get('/media', (req, res) => {
    try {
        if (!fs.existsSync(uploadsDir)) {
            return res.json([]);
        }
        const files = fs.readdirSync(uploadsDir);
        const mediaList = files
            .filter(file => !file.startsWith('.'))
            .map(file => {
                const filePath = path.join(uploadsDir, file);
                const stats = fs.statSync(filePath);
                return {
                    filename: file,
                    url: `/uploads/${file}`,
                    size: stats.size,
                    created_at: stats.mtime
                };
            })
            .sort((a, b) => b.created_at - a.created_at);
        res.json(mediaList);
    } catch (err) {
        res.status(500).json({ message: 'Failed to read media directory', error: err.message });
    }
});

// 20. Delete an Uploaded Media Asset (Admin only)
router.delete('/media/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(uploadsDir, filename);

        // Security check: prevent directory traversal
        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(path.resolve(uploadsDir))) {
            return res.status(403).json({ message: 'Forbidden access path.' });
        }

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ message: 'Media file deleted successfully.' });
        } else {
            res.status(404).json({ message: 'Media file not found.' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete media file', error: err.message });
    }
});

module.exports = router;
