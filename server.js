require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const profileRoutes = require('./routes/profile');
const supportRoutes = require('./routes/support');
const categoryRoutes = require('./routes/categories');
const settingsRoutes = require('./routes/settings');
const sizeGuideRoutes = require('./routes/sizeGuides');
const postRoutes = require('./routes/posts');
const reviewRoutes = require('./routes/reviews');
const logger = require('./middleware/logger');
const store = require('./store');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(logger);

// Auto-sync state to MongoDB on mutating requests (POST, PUT, DELETE)
// This is critical for hosted environments like Render where the CPU gets throttled/paused
// after a response is sent, preventing background setInterval loops from running.
app.use((req, res, next) => {
    if (req.method !== 'GET') {
        const originalJson = res.json.bind(res);
        const originalSend = res.send.bind(res);
        let synced = false;

        // Flush state to MongoDB and only THEN send the response. The sync must be
        // awaited (not fire-and-forget): on Render's free tier the CPU is throttled
        // the moment the response is flushed, so a non-awaited write never completes
        // and the data is lost on the next restart. Keeping the request open until
        // the write finishes guarantees persistence.
        const syncThenSend = (sendFn, body) => {
            if (synced) return sendFn(body);
            synced = true;
            store.checkAndSync()
                .catch(err => console.error('[Sync Middleware] Auto-sync to MongoDB failed:', err.message))
                .finally(() => sendFn(body));
            return res;
        };

        res.json = function(body) {
            return syncThenSend(originalJson, body);
        };

        res.send = function(body) {
            return syncThenSend(originalSend, body);
        };
    }
    next();
});

// Maintenance Mode check middleware
app.use((req, res, next) => {
    // Check if maintenance mode is active
    if (store.site_settings.maintenance_mode === 'true' || store.site_settings.maintenance_mode === '1') {
        // Exclude admin routes, auth login/me routes, and settings GET route
        const isGetSettings = req.path === '/api/settings' && req.method === 'GET';
        const isAuthRoute = req.path === '/api/auth/login' || req.path === '/api/auth/me';
        const isAdminRoute = req.path.startsWith('/api/admin');

        if (isGetSettings || isAuthRoute || isAdminRoute) {
            return next();
        }

        // Also check if requester is an admin (authenticated via Bearer token)
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecret_key_uclose_ecommerce_jwt_token_2026');
                if (decoded && decoded.id) {
                    const user = store.users.find(u => u.id === decoded.id);
                    if (user && user.role === 'admin') {
                        return next();
                    }
                }
            } catch (err) {
                // Not a valid admin token
            }
        }

        return res.status(503).json({
            message: 'Maintenance Mode',
            details: store.site_settings.announcement_banner || 'The store is currently undergoing maintenance. Please try again later.'
        });
    }
    next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth/profile', profileRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/size-guides', sizeGuideRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/reviews', reviewRoutes);

// Root welcome endpoint
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Uclose API Server</title>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700&display=swap" rel="stylesheet">
            <style>
                body {
                    font-family: 'Outfit', sans-serif;
                    background-color: #fafafa;
                    color: #000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    margin: 0;
                    text-align: center;
                }
                .container {
                    padding: 40px;
                    background: #fff;
                    border: 1px solid #e5e7eb;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                    max-width: 500px;
                }
                h1 {
                    font-size: 24px;
                    text-transform: uppercase;
                    letter-spacing: -0.5px;
                    margin-bottom: 12px;
                }
                p {
                    color: #4b5563;
                    font-size: 14px;
                    line-height: 1.5;
                }
                a {
                    color: #000;
                    font-weight: 700;
                    text-decoration: underline;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Uclose API Server</h1>
                <p>The backend application server is running successfully.</p>
                <p>Visit <a href="/api/health">/api/health</a> to check system health.</p>
            </div>
        </body>
        </html>
    `);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date() });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
