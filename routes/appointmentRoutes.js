const express = require("express");
const { query } = require("../config/db"); // Use the query function from db.js for consistency
const authenticateToken = require("../middleware/authMiddleware");
const axios = require("axios");

const router = express.Router();

// Book an Appointment (Client -> Doctor)
router.post("/book", authenticateToken, async (req, res) => {
  const { doctorId, appointmentDate, amount } = req.body;
  let { phoneNumber } = req.body;
  const clientId = req.user.id;

  try {
    // Input validation
    if (!doctorId || !appointmentDate || !phoneNumber || !amount) {
      return res.status(400).json({ error: "Missing required fields: doctorId, appointmentDate, phoneNumber, amount." });
    }

    // Validate appointmentDate
    const date = new Date(appointmentDate);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: "Invalid appointment date. Use ISO format (e.g., 2025-03-21T10:00:00.000Z)." });
    }

    // Normalize phone number
    phoneNumber = phoneNumber.replace(/\s/g, ""); // Remove spaces
    if (phoneNumber.startsWith("+254")) {
      phoneNumber = phoneNumber.replace("+254", "254");
    } else if (phoneNumber.startsWith("0")) {
      phoneNumber = "254" + phoneNumber.slice(1);
    }

    if (!phoneNumber.match(/^2547\d{8}$/)) {
      return res.status(400).json({ error: "Invalid phone number format. Use 2547XXXXXXXX." });
    }

    // Validate amount
    if (typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number." });
    }

    // Check for existing appointment with "Pending Payment" status
    const existingAppointment = await query(
      "SELECT * FROM appointments WHERE client_id = ? AND doctor_id = ? AND appointment_date = ? AND status = 'Pending Payment'",
      [clientId, doctorId, appointmentDate]
    );

    let appointmentId;
    if (existingAppointment.length > 0) {
      appointmentId = existingAppointment[0].id;
      await query(
        "UPDATE appointments SET created_at = NOW() WHERE id = ?",
        [appointmentId]
      );
    } else {
      // Check for conflicting appointments
      const conflictAppointment = await query(
        "SELECT * FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status != 'Pending Payment'",
        [doctorId, appointmentDate]
      );

      if (conflictAppointment.length > 0) {
        return res.status(400).json({ message: "Doctor is already booked at this time." });
      }

      // Insert new appointment
      const insertedAppointment = await query(
        "INSERT INTO appointments (client_id, doctor_id, appointment_date, amount, phone_number, status, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
        [clientId, doctorId, appointmentDate, amount, phoneNumber, "Pending Payment"]
      );
      appointmentId = insertedAppointment.insertId;
    }

    // Initiate MPESA payment
    const paymentResponse = await axios.post(process.env.MPESA_PAYMENT_URL, {
      doctorId,
      amount,
      accountReference: appointmentId.toString(),
      clientPhoneNumber: phoneNumber,
    });

    if (paymentResponse.data.paymentStatus === "Pending") {
      return res.status(200).json({
        message: paymentResponse.data.message,
        paymentStatus: "Pending",
        paymentDetails: paymentResponse.data.paymentDetails,
        appointmentId,
      });
    } else {
      // Delete the appointment if payment initiation fails
      await query("DELETE FROM appointments WHERE id = ?", [appointmentId]);
      console.error("Payment initiation failed:", paymentResponse.data);
      return res.status(500).json({ message: "Payment initiation failed.", paymentResponse: paymentResponse.data });
    }
  } catch (error) {
    console.error("Error booking appointment:", error.message);
    res.status(500).json({ error: `Failed to book appointment: ${error.message}` });
  }
});

// Get Client Appointments
router.get("/client/appointments", authenticateToken, async (req, res) => {
  const clientId = req.user.id;
  try {
    const appointments = await query(
      `
      SELECT 
        a.id,
        a.client_id,
        a.doctor_id,
        u.name AS doctor_name,
        u.specialization,
        a.appointment_date,
        a.amount,
        a.phone_number,
        a.status,
        a.created_at,
        a.updated_at,
        a.payment_status,
        a.transaction_id
      FROM 
        appointments a
      LEFT JOIN 
        users u ON a.doctor_id = u.id
      WHERE 
        a.client_id = ?
      `,
      [clientId]
    );
    res.status(200).json(appointments);
  } catch (error) {
    console.error("Error fetching client appointments:", error.message);
    res.status(500).json({ error: `Failed to fetch client appointments: ${error.message}` });
  }
});

// Get Doctor's Appointments
router.get("/doctor/appointments", authenticateToken, async (req, res) => {
  console.log("GET /api/appointments/doctor/appointments hit");
  const user = req.user;

  if (user.role !== "doctor") {
    console.log("Access denied: User is not a doctor, role:", user.role);
    return res.status(403).json({ error: "Access denied: Only doctors can access this route" });
  }

  const doctorId = user.id;
  console.log("Doctor ID from token:", doctorId);

  try {
    const appointments = await query(
      "SELECT * FROM appointments WHERE doctor_id = ? ORDER BY appointment_date ASC",
      [doctorId]
    );
    console.log("Appointments fetched for doctorId:", doctorId, ":", appointments);
    res.status(200).json(appointments);
  } catch (error) {
    console.error("Error fetching doctor appointments:", error.message);
    res.status(500).json({ error: `Failed to fetch doctor appointments: ${error.message}` });
  }
});

// Cleanup Expired Appointments (Note: This won't work in Vercel's serverless environment)
const cleanupExpiredAppointments = async () => {
  try {
    const expiredAppointments = await query(
      "SELECT id FROM appointments WHERE status = 'Pending Payment' AND created_at < NOW() - INTERVAL 15 MINUTE"
    );

    if (expiredAppointments.length > 0) {
      const ids = expiredAppointments.map(app => app.id);
      await query(
        "DELETE FROM appointments WHERE id IN (?)",
        [ids]
      );
      console.log(`Expired appointments cleaned up: ${ids}`);
    } else {
      console.log("No expired appointments to clean up.");
    }
  } catch (error) {
    console.error("Error cleaning up expired appointments:", error.message);
  }
};

// Note: setInterval won't work in Vercel's serverless environment
// Consider using Vercel's cron jobs or an external scheduler instead
if (process.env.NODE_ENV !== "production") {
  setInterval(cleanupExpiredAppointments, 5 * 60 * 1000);
}

module.exports = router;