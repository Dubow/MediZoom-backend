const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db"); // Database connection
const router = express.Router();

// Signup endpoint
router.post("/signup", async (req, res) => {
  const { name, email, password, role, specialization } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    let sql = "INSERT INTO users (name, email, password, role, specialization) VALUES (?, ?, ?, ?, ?)";
    db.query(sql, [name, email, hashedPassword, role, specialization || null], (err, result) => {
      if (err) return res.status(500).json({ error: "Signup failed" });
      res.json({ message: "User registered successfully" });
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Login endpoint
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
    if (err || results.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  });
});

module.exports = router;
