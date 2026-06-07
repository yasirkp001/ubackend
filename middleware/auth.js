const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Access denied. Invalid token format.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecret_key_uclose_ecommerce_jwt_token_2026');
        req.user = decoded; // { id, email }
        next();
    } catch (ex) {
        res.status(400).json({ message: 'Invalid token.' });
    }
};
