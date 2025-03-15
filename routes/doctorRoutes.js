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
  const { country, summary, rate, phone, availability, profile_photo } = req.body;
  const userId = req.user.id;
  let profilePhotoToStore = null; // Initialize to null

  try {
      if (req.file) {
          // New file uploaded, use relative path
          profilePhotoToStore = `/uploads/${req.file.filename}`;
      } else if (profile_photo) {
          // Existing photo URL or relative path sent in request body
          if (profile_photo.startsWith("http")) {
              // Extract relative path from full URL
              const baseUrl = "http://192.168.10.7:5000"; 
              profilePhotoToStore = profile_photo.replace(baseUrl, "");
          } else {
              // Relative path already provided
              profilePhotoToStore = profile_photo;
          }
      } else {
          // No new file uploaded and no existing photo provided
          // Check if there is an existing photo in the database
          const [existingProfile] = await db.promise().query("SELECT profile_photo FROM doctor_profile WHERE user_id = ?", [userId]);
          if (existingProfile.length > 0 && existingProfile[0].profile_photo) {
              // Use the existing photo from the database
              profilePhotoToStore = existingProfile[0].profile_photo;
          }
      }

      // Check if the doctor already has a profile
      const [existingProfile] = await db.promise().query("SELECT * FROM doctor_profile WHERE user_id = ?", [userId]);

      if (existingProfile.length > 0) {
          // Update existing profile
          let sql = `
              UPDATE doctor_profile
              SET country = ?, summary = ?, rate = ?, phone = ?, availability = ?, profile_photo = ?
              WHERE user_id = ?
          `;
          await db.promise().query(sql, [country, summary, rate, phone, JSON.stringify(availability), profilePhotoToStore, userId]);
      } else {
          // Create a new profile
          let sql = `
              INSERT INTO doctor_profile (user_id, country, summary, rate, phone, availability, profile_photo)
              VALUES (?, ?, ?, ?, ?, ?, ?)
          `;
          await db.promise().query(sql, [userId, country, summary, rate, phone, JSON.stringify(availability), profilePhotoToStore]);
      }

      // Update profileCompleted status
      await db.promise().query("UPDATE users SET profileCompleted = true WHERE id = ?", [userId]);

      res.status(200).json({ message: "Profile updated successfully!" });
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});

// Serve Static Images
router.use("/uploads", express.static(path.join(__dirname, "uploads"))); // Serve images from the 'uploads' folder

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

// doctor Get Doctor Profile
router.get("/profile", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const [doctorProfile] = await db.promise().query(
      `
      SELECT u.name, u.specialization, dp.country, dp.summary, dp.rate, dp.phone, dp.availability, dp.profile_photo
      FROM users u
      LEFT JOIN doctor_profile dp ON u.id = dp.user_id
      WHERE u.id = ?
      `,
      [userId]
    );

    if (doctorProfile.length === 0) {
      return res.status(404).json({ error: "Doctor profile not found" });
    }

    const profile = doctorProfile[0];
    const profilePhotoUrl = profile.profile_photo ? `http://192.168.10.7:5000${profile.profile_photo}` : null;

    // Handle availability dynamically based on its type
    let availability;
    if (!profile.availability) {
      availability = {}; // Default to empty object if null/undefined
    } else if (typeof profile.availability === "string") {
      // If it's a string, parse it as JSON
      try {
        availability = JSON.parse(profile.availability);
      } catch (e) {
        console.error("Failed to parse availability string:", profile.availability, e);
        availability = {}; // Fallback to empty object
      }
    } else {
      // If it's already an object, use it directly
      availability = profile.availability;
    }

    res.json({
      name: profile.name,
      specialization: profile.specialization,
      country: profile.country,
      summary: profile.summary,
      rate: profile.rate,
      phone: profile.phone,
      availability, // Send as parsed object
      profile_photo: profilePhotoUrl,
    });
  } catch (error) {
    console.error("Error fetching doctor profile:", error);
    res.status(500).json({ error: error.message });
  }
});

//  client Get All Doctors
router.get("/profiles", async (req, res) => {
  try {
    const [doctors] = await db.promise().query(`
      SELECT 
        u.name, u.specialization, dp.user_id, dp.country, dp.summary, dp.rate, dp.phone, dp.availability, dp.profile_photo
      FROM 
        doctor_profile dp
      JOIN 
        users u ON u.id = dp.user_id
    `);
    res.status(200).json(doctors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Specific Doctor Profile by ID
router.get("/profile/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [doctor] = await db.promise().query(`SELECT 
        u.name, u.specialization, dp.user_id, dp.country, dp.summary, dp.rate, dp.phone, dp.availability, dp.profile_photo
      FROM 
        doctor_profile dp
      JOIN 
        users u ON u.id = dp.user_id
      WHERE dp.user_id = ?
    `, [id]);
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
    // Log the stored file path for debugging
    console.log("Profile Photo Path:", profilePhoto);
    
    await db.promise().query("UPDATE doctor_profile SET profile_photo = ? WHERE user_id = ?", [profilePhoto, userId]);
    res.status(200).json({ profilePhoto });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


module.exports = router; 