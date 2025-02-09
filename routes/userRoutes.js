const express = require("express");
const authenticateToken = require("../middleware/authMiddleware");
const db = require("../config/db");

const router = express.Router();

router.get("/profile", authenticateToken, (req, res) => {
  db.query("SELECT * FROM users WHERE id = ?", [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(results[0]);
  });
});

module.exports = router;
