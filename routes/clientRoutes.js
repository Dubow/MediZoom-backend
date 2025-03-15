const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

const router = express.Router();

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    res.status(403).json({ error: "Invalid token" });
  }
};

// Get Client Profile Data
router.get("/", authenticateToken, async (req, res) => {
  try {
    const [results] = await db.promise().query("SELECT * FROM client_profile WHERE user_id = ?", [req.userId]);

    if (results.length === 0) {
      return res.status(200).json({
        phone_number: "",
        country_of_citizenship: "",
        date_of_birth: "",
        gender: "Male",
      });
    }

    res.status(200).json(results[0]);
  } catch (error) {
    console.error("Error fetching client profile:", error);
    res.status(500).json({ error: "Failed to fetch client profile" });
  }
});

// Save or Update Client Profile Data
router.post("/", authenticateToken, async (req, res) => {
  const { phone_number, country_of_citizenship, date_of_birth, gender } = req.body;

  try {
    const [existingProfile] = await db.promise().query("SELECT * FROM client_profile WHERE user_id = ?", [req.userId]);

    if (existingProfile.length > 0) {
      // Update existing profile
      await db.promise().query(
        "UPDATE client_profile SET phone_number = ?, country_of_citizenship = ?, date_of_birth = ?, gender = ? WHERE user_id = ?",
        [phone_number || null, country_of_citizenship || null, date_of_birth || null, gender || null, req.userId]
      );
    } else {
      // Insert new profile
      await db.promise().query(
        "INSERT INTO client_profile (user_id, phone_number, country_of_citizenship, date_of_birth, gender) VALUES (?, ?, ?, ?, ?)",
        [req.userId, phone_number || null, country_of_citizenship || null, date_of_birth || null, gender || null]
      );
    }

    res.status(200).json({ message: "Profile saved successfully" });
  } catch (error) {
    console.error("Error saving client profile:", error);
    res.status(500).json({ error: "Failed to save client profile" });
  }
});

module.exports = router;