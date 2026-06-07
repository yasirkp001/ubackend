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
const logger = require('./middleware/logger');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(logger);
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
