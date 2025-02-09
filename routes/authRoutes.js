const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../config/db");
const sendEmail = require("../config/email");

const router = express.Router();

// Signup with Email Verification
router.post("/signup", async (req, res) => {
  const { name, email, password, role, specialization } = req.body;

  try {
    const [existingUser] = await db.promise().query("SELECT * FROM users WHERE email = ?", [email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = crypto.randomInt(100000, 999999).toString();

    let sql = "INSERT INTO users (name, email, password, role, specialization, verification_code, verified) VALUES (?, ?, ?, ?, ?, ?, ?)";
    await db.promise().query(sql, [name, email, hashedPassword, role, specialization || null, verificationCode, false]);

    await sendEmail(email, "Verify Your Email", `Your verification code is: ${verificationCode}`);

    res.json({ message: "Signup successful. Check your email for verification code." });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify Email
router.post("/verify-email", async (req, res) => {
  const { email, code } = req.body;

  try {
    const [results] = await db.promise().query("SELECT * FROM users WHERE email = ? AND verification_code = ?", [email, code]);

    if (results.length === 0) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    await db.promise().query("UPDATE users SET verified = true, verification_code = NULL WHERE email = ?", [email]);

    res.status(200).json({ message: "Email verified successfully. You can now log in." });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login with Verification Check
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const [results] = await db.promise().query("SELECT * FROM users WHERE email = ?", [email]);

    if (results.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = results[0];

    if (!user.verified) return res.status(403).json({ error: "Please verify your email first" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });

    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Forgot Password - Request Reset
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const [results] = await db.promise().query("SELECT * FROM users WHERE email = ?", [email]);

    if (results.length === 0) {
      return res.status(400).json({ message: "User not found" });
    }

    const resetToken = crypto.randomBytes(20).toString("hex");
    const resetExpires = Date.now() + 3600000;

    await db.promise().query("UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?", [resetToken, resetExpires, email]);

    const resetLink = `${process.env.BASE_URL}/reset-password?token=${resetToken}&email=${email}`;
    await sendEmail(email, "Password Reset", `Click the link to reset your password: ${resetLink}`);

    res.status(200).json({ message: "Password reset email sent." });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset Password
router.post("/reset-password", async (req, res) => {
  const { email, token, newPassword } = req.body;

  try {
    const [results] = await db.promise().query("SELECT * FROM users WHERE email = ? AND reset_token = ?", [email, token]);

    if (results.length === 0 || results[0].reset_expires < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.promise().query("UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE email = ?", [hashedPassword, email]);

    res.status(200).json({ message: "Password reset successful. You can now log in." });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
