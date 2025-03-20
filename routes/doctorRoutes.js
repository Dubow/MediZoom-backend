const express = require("express");
const { query } = require("../config/db"); // Use the query function from db.js
const authenticateToken = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");

const router = express.Router();

// Set up storage for Multer (saving files to the 'uploads' directory)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpg|jpeg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only JPG, JPEG, and PNG files are allowed"));
  },
});

// Profile Update Route for Doctor (Including Profile Photo)
router.post("/profile", authenticateToken, upload.single("profile_photo"), async (req, res) => {
  const { country, summary, rate, phone, availability } = req.body;
  const userId = req.user.id;
  let profilePhotoToStore = null;

  try {
    // Input validation
    if (phone && !phone.match(/^\+?\d{10,15}$/)) {
      return res.status(400).json({ error: "Invalid phone number format. Use + followed by 10-15 digits." });
    }
    if (rate && (typeof rate !== "number" || rate <= 0)) {
      return res.status(400).json({ error: "Rate must be a positive number." });
    }
    if (availability) {
      try {
        JSON.parse(availability); // Ensure availability is valid JSON
      } catch (e) {
        return res.status(400).json({ error: "Invalid availability format. Must be a valid JSON string." });
      }
    }

    // Handle profile photo
    if (req.file) {
      // New file uploaded, use relative path
      profilePhotoToStore = `/uploads/${req.file.filename}`;
    } else if (req.body.profile_photo) {
      // Existing photo URL or relative path sent in request body
      const baseUrl = process.env.BASE_URL || "https://medizoom.vercel.app";
      if (req.body.profile_photo.startsWith("http")) {
        // Extract relative path from full URL
        profilePhotoToStore = req.body.profile_photo.replace(baseUrl, "");
      } else {
        // Relative path already provided
        profilePhotoToStore = req.body.profile_photo;
      }
    } else {
      // No new file uploaded and no existing photo provided
      const existingProfile = await query("SELECT profile_photo FROM doctor_profile WHERE user_id = ?", [userId]);
      if (existingProfile.length > 0 && existingProfile[0].profile_photo) {
        profilePhotoToStore = existingProfile[0].profile_photo;
      }
    }

    // Check if the doctor already has a profile
    const existingProfile = await query("SELECT * FROM doctor_profile WHERE user_id = ?", [userId]);

    if (existingProfile.length > 0) {
      // Update existing profile
      await query(
        `
        UPDATE doctor_profile
        SET country = ?, summary = ?, rate = ?, phone = ?, availability = ?, profile_photo = ?
        WHERE user_id = ?
        `,
        [country, summary, rate, phone, availability, profilePhotoToStore, userId]
      );
    } else {
      // Create a new profile
      await query(
        `
        INSERT INTO doctor_profile (user_id, country, summary, rate, phone, availability, profile_photo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [userId, country, summary, rate, phone, availability, profilePhotoToStore]
      );
    }

    // Update profileCompleted status
    await query("UPDATE users SET profileCompleted = true WHERE id = ?", [userId]);

    res.status(200).json({ message: "Profile updated successfully!" });
  } catch (error) {
    console.error("Error updating doctor profile:", error.message);
    res.status(500).json({ error: `Failed to update doctor profile: ${error.message}` });
  }
});

// Update Profile Completion Status
router.post("/update-profile-status", authenticateToken, async (req, res) => {
  const { profileCompleted } = req.body;
  const userId = req.user.id;

  try {
    if (typeof profileCompleted !== "boolean") {
      return res.status(400).json({ error: "profileCompleted must be a boolean value." });
    }

    await query("UPDATE users SET profileCompleted = ? WHERE id = ?", [profileCompleted, userId]);
    res.status(200).json({ message: "Profile completion status updated successfully!" });
  } catch (error) {
    console.error("Error updating profile completion status:", error.message);
    res.status(500).json({ error: `Failed to update profile completion status: ${error.message}` });
  }
});

// Doctor Get Doctor Profile
router.get("/profile", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const doctorProfile = await query(
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
    const baseUrl = process.env.BASE_URL || "https://medizoom.vercel.app";
    const profilePhotoUrl = profile.profile_photo ? `${baseUrl}${profile.profile_photo}` : null;

    // Handle availability dynamically based on its type
    let availability;
    if (!profile.availability) {
      availability = {};
    } else if (typeof profile.availability === "string") {
      try {
        availability = JSON.parse(profile.availability);
      } catch (e) {
        console.error("Failed to parse availability string:", profile.availability, e);
        availability = {};
      }
    } else {
      availability = profile.availability;
    }

    res.json({
      name: profile.name,
      specialization: profile.specialization,
      country: profile.country,
      summary: profile.summary,
      rate: profile.rate,
      phone: profile.phone,
      availability,
      profile_photo: profilePhotoUrl,
    });
  } catch (error) {
    console.error("Error fetching doctor profile:", error.message);
    res.status(500).json({ error: `Failed to fetch doctor profile: ${error.message}` });
  }
});

// Client Get All Doctors
router.get("/profiles", async (req, res) => {
  try {
    const doctors = await query(`
      SELECT 
        u.name, u.specialization, dp.user_id, dp.country, dp.summary, dp.rate, dp.phone, dp.availability, dp.profile_photo
      FROM 
        doctor_profile dp
      JOIN 
        users u ON u.id = dp.user_id
    `);

    // Adjust profile_photo URLs for Vercel
    const baseUrl = process.env.BASE_URL || "https://medizoom.vercel.app";
    const updatedDoctors = doctors.map(doctor => ({
      ...doctor,
      profile_photo: doctor.profile_photo ? `${baseUrl}${doctor.profile_photo}` : null,
    }));

    res.status(200).json(updatedDoctors);
  } catch (error) {
    console.error("Error fetching all doctors:", error.message);
    res.status(500).json({ error: `Failed to fetch all doctors: ${error.message}` });
  }
});

// Get Specific Doctor Profile by ID
router.get("/profile/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const doctor = await query(
      `
      SELECT 
        u.name, u.specialization, dp.user_id, dp.country, dp.summary, dp.rate, dp.phone, dp.availability, dp.profile_photo
      FROM 
        doctor_profile dp
      JOIN 
        users u ON u.id = dp.user_id
      WHERE dp.user_id = ?
      `,
      [id]
    );

    if (doctor.length === 0) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    const baseUrl = process.env.BASE_URL || "https://medizoom.vercel.app";
    const updatedDoctor = {
      ...doctor[0],
      profile_photo: doctor[0].profile_photo ? `${baseUrl}${doctor[0].profile_photo}` : null,
    };

    res.status(200).json(updatedDoctor);
  } catch (error) {
    console.error("Error fetching doctor profile by ID:", error.message);
    res.status(500).json({ error: `Failed to fetch doctor profile: ${error.message}` });
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
    console.log("Profile Photo Path:", profilePhoto);
    await query("UPDATE doctor_profile SET profile_photo = ? WHERE user_id = ?", [profilePhoto, userId]);

    const baseUrl = process.env.BASE_URL || "https://medizoom.vercel.app";
    res.status(200).json({ profilePhoto: `${baseUrl}${profilePhoto}` });
  } catch (error) {
    console.error("Error uploading profile photo:", error.message);
    res.status(500).json({ error: `Failed to upload profile photo: ${error.message}` });
  }
});

module.exports = router;