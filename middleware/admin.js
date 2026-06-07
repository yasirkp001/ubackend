const store = require('../store');

module.exports = function (req, res, next) {
    if (!req.user || !req.user.id) {
        return res.status(401).json({ message: 'Unauthorized. Access denied.' });
    }

    const user = store.users.find(u => u.id === req.user.id);
    if (!user) {
        return res.status(404).json({ message: 'User not found.' });
    }

    if (user.role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }

    next();
};
