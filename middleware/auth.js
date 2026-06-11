const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    let token = null;
    const authHeader = req.headers['authorization'];
    
    console.log('[Auth Middleware] URL:', req.url, 'Auth Header:', authHeader);
    if (authHeader) {
        token = authHeader.split(' ')[1];
    } else {
        const url = require('url');
        const parsedUrl = url.parse(req.url, true);
        if (parsedUrl.query && parsedUrl.query.token) {
            token = parsedUrl.query.token;
        }
    }

    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecret_key_uclose_ecommerce_jwt_token_2026');
        
        // Check if user is active/blocked
        const store = require('../store');
        const user = store.users.find(u => u.id === decoded.id);
        if (user && user.is_active === 0) {
            return res.status(403).json({ message: 'Your account has been deactivated. Please contact support.' });
        }

        req.user = decoded; // { id, email }
        next();
    } catch (ex) {
        res.status(400).json({ message: 'Invalid token.' });
    }
};
