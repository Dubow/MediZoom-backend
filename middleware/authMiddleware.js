const jwt = require("jsonwebtoken");
const util = require("util");

// Promisify jwt.verify for async/await
const verifyAsync = util.promisify(jwt.verify);

const authenticateToken = (requiredRole) => {
  return async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not set in environment variables");
      return res.status(500).json({ error: "Server configuration error: JWT_SECRET is missing" });
    }

    try {
      const user = await verifyAsync(token, process.env.JWT_SECRET);
      req.user = user;

      if (user.status === "suspended") {
        return res.status(403).json({ error: "Account suspended" });
      }

      if (requiredRole && user.role !== requiredRole && user.role !== "admin") {
        return res.status(403).json({ error: `Access denied: Only ${requiredRole}s or admins can access this route` });
      }

      next();
    } catch (err) {
      console.error("Token verification failed:", err.message);
      return res.status(403).json({ error: "Invalid or expired token" });
    }
  };
};

module.exports = authenticateToken;