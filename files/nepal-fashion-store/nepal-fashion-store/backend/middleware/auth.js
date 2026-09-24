const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {

    const authHeader = req.headers["authorization"];

    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {

        return res.status(401).json({
            message: "Access denied. Please login."
        });

    }

    jwt.verify(
        token,
        process.env.JWT_SECRET,
        function(error, user) {

            if (error) {

                return res.status(403).json({
                    message: "Invalid or expired token."
                });

            }

            req.user = user;

            next();
        }
    );
}

function requireAdmin(req, res, next) {

    if (req.user.role !== "admin") {

        return res.status(403).json({
            message: "Admin access required."
        });

    }

    next();
}

module.exports = {
    authenticateToken,
    requireAdmin
};