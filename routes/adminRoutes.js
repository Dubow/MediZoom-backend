const express = require("express");
const { query } = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const jwt = require("jsonwebtoken");

const router = express.Router();

// Middleware to restrict to admin only
const adminOnly = authenticateToken("admin");

// Get all users
router.get("/users", adminOnly, async (req, res) => {
  try {
    const users = await query("SELECT id, name, email, role, status FROM users");
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error.message);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Suspend a user
router.put("/users/:id/suspend", adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const user = await query("SELECT * FROM users WHERE id = ?", [id]);
    if (user.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    if (user[0].role === "admin") {
      return res.status(403).json({ error: "Cannot suspend another admin" });
    }
    await query("UPDATE users SET status = 'suspended' WHERE id = ?", [id]);

    // Log the action
    await query(
      "INSERT INTO admin_logs (admin_id, action, target_user_id, details) VALUES (?, ?, ?, ?)",
      [req.user.id, "suspend", id, `User ${id} suspended by admin ${req.user.id}`]
    );

    res.status(200).json({ message: "User suspended" });
  } catch (error) {
    console.error("Error suspending user:", error.message);
    res.status(500).json({ error: "Failed to suspend user" });
  }
});

// Delete a user
router.delete("/users/:id", adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const user = await query("SELECT * FROM users WHERE id = ?", [id]);
    if (user.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    if (user[0].role === "admin") {
      return res.status(403).json({ error: "Cannot delete another admin" });
    }
    await query("DELETE FROM users WHERE id = ?", [id]);

    // Log the action
    await query(
      "INSERT INTO admin_logs (admin_id, action, target_user_id, details) VALUES (?, ?, ?, ?)",
      [req.user.id, "delete", id, `User ${id} deleted by admin ${req.user.id}`]
    );

    res.status(200).json({ message: "User deleted" });
  } catch (error) {
    console.error("Error deleting user:", error.message);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// Impersonate a user (generate a token for another user)
router.post("/impersonate/:id", adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const user = await query("SELECT id, email, role, status FROM users WHERE id = ?", [id]);
    if (user.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const impersonatedUser = user[0];
    const token = jwt.sign(
      { id: impersonatedUser.id, email: impersonatedUser.email, role: impersonatedUser.role, status: impersonatedUser.status },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Log the action
    await query(
      "INSERT INTO admin_logs (admin_id, action, target_user_id, details) VALUES (?, ?, ?, ?)",
      [req.user.id, "impersonate", id, `Admin ${req.user.id} impersonated user ${id}`]
    );

    res.status(200).json({ token, role: impersonatedUser.role });
  } catch (error) {
    console.error("Error impersonating user:", error.message);
    res.status(500).json({ error: "Failed to impersonate user" });
  }
});

module.exports = router;