const express = require("express");
const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const axios = require("axios");

const router = express.Router();

// Book an Appointment (Client -> Doctor)
router.post("/book", authenticateToken, async (req, res) => {
  const { doctorId, appointmentDate, phoneNumber, amount } = req.body;
  const clientId = req.user.id;

  try {
    if (!doctorId || !appointmentDate || !phoneNumber || !amount) {
      return res.status(400).json({ error: "Missing required fields: doctorId, appointmentDate, phoneNumber, amount." });
    }

    const [existingAppointment] = await db.promise().query(
      "SELECT * FROM appointments WHERE client_id = ? AND doctor_id = ? AND appointment_date = ? AND status = 'Pending Payment'",
      [clientId, doctorId, appointmentDate]
    );

    let appointmentId;
    if (existingAppointment.length > 0) {
      appointmentId = existingAppointment[0].id;
      await db.promise().query(
        "UPDATE appointments SET created_at = NOW() WHERE id = ?",
        [appointmentId]
      );
    } else {
      const [conflictAppointment] = await db.promise().query(
        "SELECT * FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status != 'Pending Payment'",
        [doctorId, appointmentDate]
      );

      if (conflictAppointment.length > 0) {
        return res.status(400).json({ message: "Doctor is already booked at this time." });
      }

      const [insertedAppointment] = await db.promise().query(
        "INSERT INTO appointments (client_id, doctor_id, appointment_date, amount, phone_number, status, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
        [clientId, doctorId, appointmentDate, amount, phoneNumber, "Pending Payment"]
      );
      appointmentId = insertedAppointment.insertId;
    }

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
      await db.promise().query("DELETE FROM appointments WHERE id = ?", [appointmentId]);
      console.error("Payment initiation failed:", paymentResponse.data);
      return res.status(500).json({ message: "Payment initiation failed.", paymentResponse: paymentResponse.data });
    }
  } catch (error) {
    console.error("Error booking appointment:", error.message);
    res.status(500).json({ error: "An error occurred while booking the appointment." });
  }
});

// Get Client Appointments
router.get("/client/appointments", authenticateToken, async (req, res) => {
  const clientId = req.user.id;
  try {
    const [appointments] = await db.promise().query(
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
    res.status(500).json({ error: "Failed to fetch appointments" });
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
    const [appointments] = await db.promise().query(
      "SELECT * FROM appointments WHERE doctor_id = ? ORDER BY appointment_date ASC",
      [doctorId]
    );
    console.log("Appointments fetched for doctorId:", doctorId, ":", appointments);
    res.status(200).json(appointments);
  } catch (error) {
    console.error("Error fetching doctor appointments:", error.message);
    res.status(500).json({ error: "An error occurred while fetching appointments." });
  }
});

// Cleanup Expired Appointments
const cleanupExpiredAppointments = async () => {
  try {
    const [expiredAppointments] = await db.promise().query(
      "SELECT id FROM appointments WHERE status = 'Pending Payment' AND created_at < NOW() - INTERVAL 15 MINUTE"
    );

    if (expiredAppointments.length > 0) {
      const ids = expiredAppointments.map(app => app.id);
      await db.promise().query(
        "DELETE FROM appointments WHERE id IN (?)",
        [ids]
      );
      console.log(`Expired appointments cleaned up: ${ids}`);
    } else {
      // console.log("No expired appointments to clean up.");
    }
  } catch (error) {
    console.error("Error cleaning up expired appointments:", error.message);
  }
};

setInterval(cleanupExpiredAppointments, 5 * 60 * 1000);

module.exports = router;