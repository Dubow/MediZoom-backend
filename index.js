require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const authRoutes = require("./routes/authRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const mpesaRoutes = require("./routes/mpesaRoutes");
const clientRoutes = require("./routes/clientRoutes");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());
// Serve static files from uploads/
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/auth", authRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/mpesa", mpesaRoutes);
app.use("/api/clientprofile", clientRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));