const express = require("express");
const jwt = require("jsonwebtoken");
const { query } = require("../config/db");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

const router = express.Router();

// Configure Cloudinary storage for Multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "health_records", // Store files in a folder named "health_records" on Cloudinary
    allowed_formats: ["pdf", "jpg", "jpeg", "png"],
    public_id: (req, file) => `${req.userId}-${Date.now()}`, // Unique file name based on user ID and timestamp
    resource_type: "auto", // Automatically detect file type (image or raw for PDFs)
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|jpg|jpeg|png/;
    const extname = allowedTypes.test(file.mimetype.toLowerCase());
    if (extname) {
      return cb(null, true);
    }
    cb(new Error("Only PDF, JPG, JPEG, and PNG files are allowed"));
  },
});

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

// Get Client Profile Data and Health Records
router.get("/", authenticateToken, async (req, res) => {
  try {
    // Fetch client profile
    const profileResults = await query(
      "SELECT * FROM client_profile WHERE user_id = ?",
      [req.userId]
    );

    const profile = profileResults.length > 0 ? profileResults[0] : {
      phone_number: "",
      country_of_citizenship: "",
      date_of_birth: "",
      gender: "Male",
    };

    // Fetch health records
    const healthRecords = await query(
      "SELECT * FROM health_records WHERE user_id = ? ORDER BY uploaded_at DESC",
      [req.userId]
    );

    // Cloudinary URLs are absolute, no need to adjust
    const updatedHealthRecords = healthRecords.map(record => ({
      ...record,
      file_path: record.file_path || null,
    }));

    res.status(200).json({ profile, healthRecords: updatedHealthRecords });
  } catch (error) {
    console.error("Error fetching client profile and health records:", error.message);
    res.status(500).json({ error: `Failed to fetch client profile and health records: ${error.message}` });
  }
});

// Save or Update Client Profile Data and Add Health Record
router.post("/", authenticateToken, upload.single("file"), async (req, res) => {
  const { phone_number, country_of_citizenship, date_of_birth, gender } = req.body;

  try {
    // Input validation
    if (phone_number && !phone_number.match(/^\+?\d{10,15}$/)) {
      return res.status(400).json({ error: "Invalid phone number format. Use + followed by 10-15 digits." });
    }
    if (date_of_birth) {
      const dob = new Date(date_of_birth);
      if (isNaN(dob.getTime())) {
        return res.status(400).json({ error: "Invalid date of birth. Use ISO format (e.g., 1990-01-01)." });
      }
    }
    if (gender && !["Male", "Female", "Other"].includes(gender)) {
      return res.status(400).json({ error: "Invalid gender. Use Male, Female, or Other." });
    }

    // Update or insert client profile
    const existingProfile = await query(
      "SELECT * FROM client_profile WHERE user_id = ?",
      [req.userId]
    );

    if (existingProfile.length > 0) {
      // Update existing profile
      await query(
        "UPDATE client_profile SET phone_number = ?, country_of_citizenship = ?, date_of_birth = ?, gender = ? WHERE user_id = ?",
        [
          phone_number || null,
          country_of_citizenship || null,
          date_of_birth || null,
          gender || null,
          req.userId,
        ]
      );
    } else {
      // Insert new profile
      await query(
        "INSERT INTO client_profile (user_id, phone_number, country_of_citizenship, date_of_birth, gender) VALUES (?, ?, ?, ?, ?)",
        [
          req.userId,
          phone_number || null,
          country_of_citizenship || null,
          date_of_birth || null,
          gender || null,
        ]
      );
    }

    // If a file is uploaded, save it to health_records
    let filePath = null;
    if (req.file) {
      filePath = req.file.path; // Cloudinary secure URL
      await query(
        "INSERT INTO health_records (user_id, file_name, file_path, uploaded_at) VALUES (?, ?, ?, ?)",
        [
          req.userId,
          req.file.originalname,
          filePath,
          new Date(),
        ]
      );
    }

    // Fetch the updated profile and health records
    const updatedProfile = await query(
      "SELECT * FROM client_profile WHERE user_id = ?",
      [req.userId]
    );
    const healthRecords = await query(
      "SELECT * FROM health_records WHERE user_id = ? ORDER BY uploaded_at DESC",
      [req.userId]
    );

    // Cloudinary URLs are absolute, no need to adjust
    const updatedHealthRecords = healthRecords.map(record => ({
      ...record,
      file_path: record.file_path || null,
    }));

    res.status(200).json({
      message: "Profile updated and health record added successfully",
      profile: updatedProfile[0],
      healthRecords: updatedHealthRecords,
    });
  } catch (error) {
    console.error("Error saving client profile and health record:", error.message);
    res.status(500).json({ error: `Failed to save client profile and health record: ${error.message}` });
  }
});

// Delete a Specific Health Record
router.delete("/health-record/:id", authenticateToken, async (req, res) => {
  const recordId = req.params.id;

  try {
    // Fetch the health record
    const record = await query(
      "SELECT * FROM health_records WHERE id = ? AND user_id = ?",
      [recordId, req.userId]
    );

    if (record.length === 0) {
      return res.status(404).json({ error: "Health record not found" });
    }

    // Delete the file from Cloudinary
    const filePath = record[0].file_path;
    if (filePath) {
      const publicId = filePath.split("/").slice(-2).join("/").split(".").slice(0, -1).join("."); // Extract public ID (e.g., health_records/userid-timestamp)
      await cloudinary.uploader.destroy(publicId, { resource_type: filePath.includes(".pdf") ? "raw" : "image" });
    }

    // Delete the record from the database
    await query(
      "DELETE FROM health_records WHERE id = ? AND user_id = ?",
      [recordId, req.userId]
    );

    res.status(200).json({ message: "Health record deleted successfully" });
  } catch (error) {
    console.error("Error deleting health record:", error.message);
    res.status(500).json({ error: `Failed to delete health record: ${error.message}` });
  }
});

module.exports = router;