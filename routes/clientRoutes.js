const express = require("express");
const jwt = require("jsonwebtoken");
const { query } = require("../config/db"); // Use the query function from db.js for consistency
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/health-records/";
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|jpg|jpeg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
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

    // Adjust file_path for Vercel deployment (remove hardcoded localhost URL)
    const baseUrl = process.env.BASE_URL || "https://medizoom.vercel.app";
    const updatedHealthRecords = healthRecords.map(record => ({
      ...record,
      file_path: record.file_path.replace("http://192.168.10.7:5000", baseUrl),
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
    if (req.file) {
      const baseUrl = process.env.BASE_URL || "https://medizoom.vercel.app";
      const filePath = `${baseUrl}/uploads/health-records/${req.file.filename}`;
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

    // Adjust file_path for Vercel deployment
    const baseUrl = process.env.BASE_URL || "https://medizoom.vercel.app";
    const updatedHealthRecords = healthRecords.map(record => ({
      ...record,
      file_path: record.file_path.replace("http://192.168.10.7:5000", baseUrl),
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

    // Delete the file from the server
    const baseUrl = process.env.BASE_URL || "https://medizoom.vercel.app";
    const filePath = record[0].file_path.replace(baseUrl, "");
    const absolutePath = path.join(__dirname, "..", filePath);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
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