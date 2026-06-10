const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const store = require('../store');
const authMiddleware = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_key_uclose_ecommerce_jwt_token_2026';

// Register a new user
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        // Check if user already exists
        const existingUser = store.users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists with this email.' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insert new user
        const newUserId = store.users.length > 0 ? Math.max(...store.users.map(u => u.id)) + 1 : 1;
        const newUser = {
            id: newUserId,
            name: name || '',
            email: email.toLowerCase(),
            password_hash: passwordHash,
            role: 'customer',
            phone: '',
            dp: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || 'User')}`,
            created_at: new Date().toISOString(),
            is_active: 1
        };
        store.users.push(newUser);

        // Save to backend live activities store
        store.addLiveActivity(
            'user-registered',
            'New User Registration',
            `${newUser.name} (${newUser.email}) registered as a customer.`,
            '#10b981',
            '👤'
        );

        // Broadcast real-time SSE notification
        const sseService = require('../services/sseService');
        sseService.broadcast('user-registered', { name: newUser.name, email: newUser.email, time: newUser.created_at });

        // Generate JWT token
        const token = jwt.sign({ id: newUserId, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });

        return res.status(201).json({
            token,
            user: { id: newUserId, name: newUser.name, email: newUser.email, role: newUser.role, phone: '', dp: newUser.dp }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error.', error: error.message });
    }
});

// Login user
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const user = store.users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (!user) {
            return res.status(400).json({ message: 'Invalid email or password.' });
        }

        if (user.is_active === 0) {
            return res.status(403).json({ message: 'Your account has been deactivated. Please contact support.' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid email or password.' });
        }

        // Generate JWT token
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        // Save to backend live activities store
        store.addLiveActivity(
            'login',
            user.role === 'admin' ? 'Admin Login' : 'User Login',
            `${user.name} (${user.email}) logged in.`,
            '#8b5cf6',
            '🔑'
        );

        // Broadcast real-time SSE login notification
        try {
            const sseService = require('../services/sseService');
            sseService.broadcast('login', {
                name: user.name,
                email: user.email,
                role: user.role,
                time: new Date().toISOString()
            });
        } catch (sseErr) {
            console.error('Failed to broadcast login via SSE:', sseErr.message);
        }

        return res.json({
            token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone || '', dp: user.dp || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name || 'User')}` }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error.', error: error.message });
    }
});

// Get currently logged in user info
router.get('/me', authMiddleware, (req, res) => {
    const user = store.users.find(u => u.id === req.user.id);
    if (!user) {
        return res.status(404).json({ message: 'User not found.' });
    }
    if (user.is_active === 0) {
        return res.status(403).json({ message: 'Your account has been deactivated. Please contact support.' });
    }
    if (!user.dp) {
        user.dp = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name || 'User')}`;
    }
    res.json({ user });
});

// Logout user
router.post('/logout', authMiddleware, (req, res) => {
    try {
        const user = store.users.find(u => u.id === req.user.id);
        if (user) {
            // Save to backend live activities store
            store.addLiveActivity(
                'logout',
                user.role === 'admin' ? 'Admin Logout' : 'User Logout',
                `${user.name} (${user.email}) logged out.`,
                '#ef4444',
                '🚪'
            );

            // Broadcast real-time SSE logout notification
            try {
                const sseService = require('../services/sseService');
                sseService.broadcast('logout', {
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    time: new Date().toISOString()
                });
            } catch (sseErr) {
                console.error('Failed to broadcast logout via SSE:', sseErr.message);
            }
        }
        res.json({ message: 'Logged out successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error.', error: error.message });
    }
});

// Change user password (for storefront users)
router.put('/change-password', authMiddleware, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        if (!current_password || !new_password) {
            return res.status(400).json({ message: 'Current and new passwords are required.' });
        }

        const user = store.users.find(u => u.id === req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const isMatch = await bcrypt.compare(current_password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect.' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password_hash = await bcrypt.hash(new_password, salt);

        // Save to backend live activities store
        store.addLiveActivity(
            'password-changed',
            user.role === 'admin' ? 'Admin Password Changed' : 'User Password Changed',
            `${user.name} (${user.email}) changed their password.`,
            '#f43f5e',
            '🔒'
        );

        // Broadcast real-time SSE password change notification
        try {
            const sseService = require('../services/sseService');
            sseService.broadcast('password-changed', {
                name: user.name,
                email: user.email,
                role: user.role,
                time: new Date().toISOString()
            });
        } catch (sseErr) {
            console.error('Failed to broadcast password-changed via SSE:', sseErr.message);
        }

        res.json({ message: 'Password changed successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error.', error: error.message });
    }
});

module.exports = router;
