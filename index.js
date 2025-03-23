require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const authRoutes = require("./routes/authRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const mpesaRoutes = require("./routes/mpesaRoutes");
const clientRoutes = require("./routes/clientRoutes");
const adminRoutes = require("./routes/adminRoutes");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());

// Test endpoint to verify API routing
app.get("/api/test", (req, res) => {
  res.json({ message: "API is working" });
});

// Serve static files from uploads/
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/auth", authRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/mpesa", mpesaRoutes);
app.use("/api/clientprofile", clientRoutes);
app.use("/api/admin", adminRoutes);

// Export the app as a Vercel serverless function
module.exports = app;

// For local development, start the server
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}