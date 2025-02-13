require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const authRoutes = require("./routes/authRoutes");
const doctorRoutes = require("./routes/doctorRoutes"); 

const app = express();
app.use(express.json());
app.use(cors());
app.use("/api/auth", authRoutes);
app.use("/api/doctor", doctorRoutes); 
app.use("/uploads", express.static("uploads"));

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
  } else {
    console.log("Connected to MySQL database");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
