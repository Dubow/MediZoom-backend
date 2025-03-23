const jwt = require("jsonwebtoken");

const authenticateToken = (requiredRole) => {
  return (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ error: "Invalid or expired token" });
      }

      req.user = user;

      // Check user status
      if (user.status === "suspended") {
        return res.status(403).json({ error: "Account suspended" });
      }

      // Role-based access control
      if (requiredRole && user.role !== requiredRole && user.role !== "admin") {
        return res.status(403).json({ error: `Access denied: Only ${requiredRole}s or admins can access this route` });
      }

      next();
    });
  };
};

module.exports = authenticateToken;