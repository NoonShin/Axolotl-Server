const jwt = require("jsonwebtoken");
require('dotenv').config()


module.exports = (req, res, next) => {
    try {
        // Get the Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Authorization header missing or malformed" });
        }

        // Extract token from "Bearer <token>"
        const token = authHeader.split(" ")[1];

        // Verify and decode the token
        // Attach user info to the request
        req.user = jwt.verify(token, process.env.JWT_SECRET);

        next();
    } catch (error) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
};
