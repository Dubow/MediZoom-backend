const express = require("express");
const { query } = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

const router = express.Router();

// Set up Cloudinary storage for Multer
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "doctor_profiles",
    allowed_formats: ["jpg", "jpeg", "png"],
    public_id: (req, file) => `${req.user.id}-${Date.now()}`,
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only JPG, JPEG, and PNG files are allowed"));
  },
});

const uploadWithTimeout = (req, res, next) => {
  const uploadMiddleware = upload.single("profile_photo");
  const timeout = 20000; // 20 seconds

  return Promise.race([
    new Promise((resolve, reject) => {
      uploadMiddleware(req, res, (err) => {
        if (err) return reject(err);
        resolve();
      });
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Upload to Cloudinary timed out")), timeout)
    ),
  ])
    .then(() => next())
    .catch((err) => {
      console.error("Upload error:", err.message);
      res.status(500).json({ error: "Failed to upload file to Cloudinary. Please try again." });
    });
};

// Profile Update Route for Doctor (Including Profile Photo)
router.post("/profile", authenticateToken("doctor"), upload.single("profile_photo"), async (req, res) => {
  const { country, summary, rate, phone, availability } = req.body;
  const userId = req.user.id;
  let profilePhotoToStore = null;

  try {
    console.log("Received profile update request:", { country, summary, rate, phone, availability });

    // Input validation
    if (phone && !phone.match(/^\+?\d{10,15}$/)) {
      return res.status(400).json({ error: "Invalid phone number format. Use + followed by 10-15 digits." });
    }
    if (rate && (typeof rate !== "number" || rate <= 0)) {
      return res.status(400).json({ error: "Rate must be a positive number." });
    }
    if (availability) {
      try {
        JSON.parse(availability);
      } catch (e) {
        return res.status(400).json({ error: "Invalid availability format. Must be a valid JSON string." });
      }
    }

    // Handle profile photo
    if (req.file) {
      console.log("New file uploaded to Cloudinary");
      profilePhotoToStore = req.file.path; // Cloudinary provides the secure URL in req.file.path
    } else if (req.body.profile_photo) {
      console.log("Using existing profile photo URL:", req.body.profile_photo);
      profilePhotoToStore = req.body.profile_photo;
      // Validate the URL (basic check)
      if (!profilePhotoToStore.startsWith("https://res.cloudinary.com")) {
        console.warn("Invalid profile photo URL:", profilePhotoToStore);
        profilePhotoToStore = null; // Ignore invalid URLs
      }
    } else {
      console.log("No new file uploaded, checking existing profile photo");
      const existingProfile = await query("SELECT profile_photo FROM doctor_profile WHERE user_id = ?", [userId]);
      if (existingProfile.length > 0 && existingProfile[0].profile_photo) {
        profilePhotoToStore = existingProfile[0].profile_photo;
      }
    }

    console.log("Profile photo to store:", profilePhotoToStore);

    // Check if the doctor already has a profile
    const existingProfile = await query("SELECT * FROM doctor_profile WHERE user_id = ?", [userId]);

    if (existingProfile.length > 0) {
      console.log("Updating existing profile for user:", userId);
      await query(
        `
        UPDATE doctor_profile
        SET country = ?, summary = ?, rate = ?, phone = ?, availability = ?, profile_photo = ?
        WHERE user_id = ?
        `,
        [country, summary, rate, phone, availability, profilePhotoToStore, userId]
      );
    } else {
      console.log("Creating new profile for user:", userId);
      await query(
        `
        INSERT INTO doctor_profile (user_id, country, summary, rate, phone, availability, profile_photo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [userId, country, summary, rate, phone, availability, profilePhotoToStore]
      );
    }

    console.log("Updating profileCompleted status for user:", userId);
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
router.get("/profile", authenticateToken("doctor"), async (req, res) => {
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
    const profilePhotoUrl = profile.profile_photo || null;

    let availability;
    if (!profile.availability) {
      availability = {};
    } else if (typeof profile.availability === "string") {
      try {
        availability = JSON.parse(profile.availability);
        if (!availability || typeof availability !== "object") {
          availability = {};
        }
      } catch (e) {
        console.error("Failed to parse availability string:", profile.availability, e);
        availability = {};
      }
    } else {
      availability = profile.availability || {};
    }

    res.json({
      name: profile.name || "",
      specialization: profile.specialization || "",
      country: profile.country || "",
      summary: profile.summary || "",
      rate: profile.rate ? profile.rate.toString() : "",
      phone: profile.phone || "",
      availability,
      profile_photo: profilePhotoUrl,
    });
  } catch (error) {
    console.error("Error fetching doctor profile:", error.message);
    res.status(500).json({ error: "Failed to fetch doctor profile. Please try again later." });
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

    // No need to adjust profile_photo URLs since Cloudinary URLs are absolute
    const updatedDoctors = doctors.map(doctor => ({
      ...doctor,
      profile_photo: doctor.profile_photo || null,
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

    // No need to adjust profile_photo URL since Cloudinary URLs are absolute
    const updatedDoctor = {
      ...doctor[0],
      profile_photo: doctor[0].profile_photo || null,
    };

    res.status(200).json(updatedDoctor);
  } catch (error) {
    console.error("Error fetching doctor profile by ID:", error.message);
    res.status(500).json({ error: `Failed to fetch doctor profile: ${error.message}` });
  }
});

// Profile Photo Upload Route
router.post("/upload-photo", authenticateToken("doctor"), uploadWithTimeout, async (req, res) => {
  if (!req.file) {
    console.error("No file uploaded in request.");
    return res.status(400).json({ error: "No file uploaded" });
  }

  const profilePhoto = req.file.path; // Cloudinary secure URL
  const userId = req.user.id;

  try {
    console.log("Profile Photo URL:", profilePhoto);

    const existingProfile = await query("SELECT * FROM doctor_profile WHERE user_id = ?", [userId]);

    if (existingProfile.length === 0) {
      console.log("Creating new doctor_profile record for user:", userId);
      await query(
        `
        INSERT INTO doctor_profile (user_id, profile_photo, country, summary, rate, phone, availability)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [userId, profilePhoto, "", "", 0, "", "{}"] // Default values for required fields
      );
    } else {
      console.log("Updating existing doctor_profile record for user:", userId);
      await query(
        "UPDATE doctor_profile SET profile_photo = ? WHERE user_id = ?",
        [profilePhoto, userId]
      );
    }

    res.status(200).json({ profilePhoto });
  } catch (error) {
    console.error("Error uploading profile photo:", error.message);
    res.status(500).json({ error: "Failed to upload profile photo. Please try again." });
  }
});

module.exports = router;