const express = require("express");
const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");

const router = express.Router();

// Set up storage for Multer (saving files to the 'uploads' directory)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Specify the destination folder
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
  },
});

const upload = multer({ storage });

// Profile Update Route for Doctor (Including Profile Photo)
router.post("/profile", authenticateToken, upload.single("profile_photo"), async (req, res) => {
  const { country, summary, rate, phone, availability } = req.body;
  const userId = req.user.id; // Get user ID from JWT token
  const profilePhoto = req.file ? `/uploads/${req.file.filename}` : null; // Handle photo upload if present

  try {
    // Check if the doctor already has a profile
    const [existingProfile] = await db.promise().query("SELECT * FROM doctor_profile WHERE user_id = ?", [userId]);

    if (existingProfile.length > 0) {
      // Update existing profile
      let sql = `
        UPDATE doctor_profile
        SET country = ?, summary = ?, rate = ?, phone = ?, availability = ?, profile_photo = ?
        WHERE user_id = ?
      `;
      await db.promise().query(sql, [country, summary, rate, phone, JSON.stringify(availability), profilePhoto, userId]);
    } else {
      // Create a new profile if one doesn't exist
      let sql = `
        INSERT INTO doctor_profile (user_id, country, summary, rate, phone, availability, profile_photo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      await db.promise().query(sql, [userId, country, summary, rate, phone, JSON.stringify(availability), profilePhoto]);
    }

    // Update profileCompleted status in users table
    await db.promise().query("UPDATE users SET profileCompleted = true WHERE id = ?", [userId]);

    res.status(200).json({ message: "Profile updated successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve Static Images
router.use("/uploads", express.static("uploads")); // Serve images from the 'uploads' folder

// Update Profile Completion Status
router.post("/update-profile-status", authenticateToken, async (req, res) => {
  const { profileCompleted } = req.body;
  const userId = req.user.id;

  try {
    await db.promise().query("UPDATE users SET profileCompleted = ? WHERE id = ?", [profileCompleted, userId]);
    res.status(200).json({ message: "Profile completion status updated successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Doctor Profile
router.get("/profile", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const [doctorProfile] = await db.promise().query(
      "SELECT country, summary, rate, phone, availability, profile_photo FROM doctor_profile WHERE user_id = ?",
      [userId]
    );

    if (doctorProfile.length === 0) {
      return res.status(404).json({ message: "Doctor profile not found" });
    }

    res.json(doctorProfile[0]); // Return doctor profile data
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get All Doctors
router.get("/profiles", async (req, res) => {
  try {
    const [doctors] = await db.promise().query("SELECT * FROM doctor_profile");
    res.status(200).json(doctors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Specific Doctor Profile by ID
router.get("/profile/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [doctor] = await db.promise().query("SELECT * FROM doctor_profile WHERE user_id = ?", [id]);
    if (doctor.length === 0) {
      return res.status(404).json({ message: "Doctor not found" });
    }
    res.status(200).json(doctor[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Profile Photo Upload Route
router.post("/upload-photo", authenticateToken, upload.single("profile_photo"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const profilePhoto = `/uploads/${req.file.filename}`;
  const userId = req.user.id;

  try {
    await db.promise().query("UPDATE doctor_profile SET profile_photo = ? WHERE user_id = ?", [profilePhoto, userId]);
    res.status(200).json({ profilePhoto });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;