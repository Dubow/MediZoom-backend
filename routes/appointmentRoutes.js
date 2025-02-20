const express = require("express");
const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const axios = require("axios");

const router = express.Router();

// Book an Appointment (Client -> Doctor)
router.post("/book", authenticateToken, async (req, res) => {
  const { doctorId, appointmentDate, phoneNumber, amount } = req.body;
  const clientId = req.user.id; // Get client ID from JWT token

  try {
      // ... (existing appointment availability check) ...

      // Insert appointment as pending
      const [insertedAppointment] = await db.promise().query(
          "INSERT INTO appointments (client_id, doctor_id, appointment_date, status) VALUES (?, ?, ?, ?)",
          [clientId, doctorId, appointmentDate, "Pending"]
      );

      // Prepare M-Pesa payment data
      const paymentResponse = await axios.post(process.env.MPESA_PAYMENT_URL, {
          phoneNumber,
          amount: amount,
          accountReference: insertedAppointment.insertId.toString(), // Convert to string
          transactionDesc: `Appointment payment for appointment ID: ${insertedAppointment.insertId}`
      });

      // Check payment status in response
      if (paymentResponse.data?.paymentDetails?.ResponseCode === "0") {
          // Update the appointment as Payment Pending
          await db.promise().query(
              "UPDATE appointments SET status = 'Payment Pending' WHERE id = ?",
              [insertedAppointment.insertId]
          );
          return res.status(200).json({
              message: "Appointment booked successfully. Please complete your payment.",
              paymentStatus: "Pending",
              paymentDetails: paymentResponse.data.paymentDetails,
          });
      } else {
          console.error("Payment initiation failed:", paymentResponse.data);
          return res.status(500).json({ message: "Payment initiation failed.", paymentResponse: paymentResponse.data });
      }
  } catch (error) {
      console.error("Error booking appointment:", error);
      res.status(500).json({ error: "An error occurred while booking the appointment." });
  }
});

// View Appointments (Doctor)
router.get("/doctor/appointments", authenticateToken, async (req, res) => {
  const doctorId = req.user.id; // Get doctor ID from JWT token

  try {
    const [appointments] = await db.promise().query(
      "SELECT * FROM appointments WHERE doctor_id = ? ORDER BY appointment_date DESC",
      [doctorId]
    );
    res.status(200).json(appointments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Confirm or Reject Appointment (Doctor)
router.post("/doctor/appointment/update", authenticateToken, async (req, res) => {
  const { appointmentId, status } = req.body;
  const doctorId = req.user.id; // Get doctor ID from JWT token

  try {
    // Ensure the doctor is the one who is updating the appointment
    const [appointment] = await db.promise().query(
      "SELECT * FROM appointments WHERE id = ? AND doctor_id = ?",
      [appointmentId, doctorId]
    );

    if (appointment.length === 0) {
      return res.status(404).json({ message: "Appointment not found or you're not authorized." });
    }

    // Update appointment status
    await db.promise().query(
      "UPDATE appointments SET status = ? WHERE id = ?",
      [status, appointmentId]
    );

    res.status(200).json({ message: `Appointment ${status} successfully.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// View Appointments (Client)
router.get("/client/appointments", authenticateToken, async (req, res) => {
  const clientId = req.user.id; // Get client ID from JWT token

  try {
    const [appointments] = await db.promise().query(
      "SELECT * FROM appointments WHERE client_id = ? ORDER BY appointment_date DESC",
      [clientId]
    );
    res.status(200).json(appointments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
