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
    // Check if the doctor is available at the given date and time
    const [existingAppointment] = await db.promise().query(
      "SELECT * FROM appointments WHERE doctor_id = ? AND appointment_date = ?",
      [doctorId, appointmentDate]
    );

    if (existingAppointment.length > 0) {
      return res.status(400).json({ message: "Doctor is already booked at this time." });
    }

    // Insert appointment with "Pending Payment" status and timestamp
    const [insertedAppointment] = await db.promise().query(
      "INSERT INTO appointments (client_id, doctor_id, appointment_date, status, created_at) VALUES (?, ?, ?, ?, NOW())",
      [clientId, doctorId, appointmentDate, "Pending Payment"]
    );
    const appointmentId = insertedAppointment.insertId;

    // Fetch doctor's phone number from the database
    const [doctorData] = await db.promise().query(
      "SELECT phone FROM doctor_profile WHERE user_id = ?",
      [doctorId]
    );

    if (!doctorData || doctorData.length === 0) {
      // Clean up the appointment if doctor phone is not found
      await db.promise().query("DELETE FROM appointments WHERE id = ?", [appointmentId]);
      return res.status(404).json({ error: "Doctor phone number not found." });
    }

    const doctorPhone = doctorData[0].phone;

    // Prepare M-Pesa payment data
    const paymentResponse = await axios.post(process.env.MPESA_PAYMENT_URL, {
      phoneNumber: phoneNumber, // Use client's phone number for payment initiation
      amount: amount,
      accountReference: appointmentId.toString(),
      transactionDesc: `Appointment payment for appointment ID: ${appointmentId}`,
    });

    // Check payment initiation response
    if (paymentResponse.data?.paymentDetails?.ResponseCode === "0") {
      return res.status(200).json({
        message: "Appointment reserved successfully. Please complete your payment within 15 minutes, or it will expire.",
        paymentStatus: "Pending",
        paymentDetails: paymentResponse.data.paymentDetails,
        appointmentId: appointmentId,
      });
    } else {
      // Clean up the appointment if payment initiation fails
      await db.promise().query("DELETE FROM appointments WHERE id = ?", [appointmentId]);
      console.error("Payment initiation failed:", paymentResponse.data);
      return res.status(500).json({ message: "Payment initiation failed.", paymentResponse: paymentResponse.data });
    }
  } catch (error) {
    console.error("Error booking appointment:", error);
    res.status(500).json({ error: "An error occurred while booking the appointment." });
  }
});

// M-Pesa Callback Route (to confirm payment and update status)
router.post("/mpesa-callback", async (req, res) => {
  const { ResultCode, CheckoutRequestID, Amount, MpesaReceiptNumber, TransactionDate } = req.body.Body.stkCallback;

  try {
    if (ResultCode === 0) {
      // Payment successful
      const [appointment] = await db.promise().query(
        "SELECT * FROM appointments WHERE id = (SELECT accountReference FROM mpesa_payments WHERE checkoutRequestID = ?) AND status = 'Pending Payment'",
        [CheckoutRequestID]
      );

      if (appointment.length > 0) {
        await db.promise().query(
          "UPDATE appointments SET status = 'Booked', payment_status = 'Completed', mpesa_receipt = ? WHERE id = ?",
          [MpesaReceiptNumber, appointment[0].id]
        );
        // Optionally, store payment details in a separate table
        await db.promise().query(
          "INSERT INTO mpesa_payments (appointment_id, checkoutRequestID, amount, mpesa_receipt, transaction_date) VALUES (?, ?, ?, ?, ?)",
          [appointment[0].id, CheckoutRequestID, Amount, MpesaReceiptNumber, TransactionDate]
        );
      }
    }
    res.status(200).json({ message: "Callback processed" });
  } catch (error) {
    console.error("Error processing M-Pesa callback:", error);
    res.status(500).json({ error: "Failed to process callback" });
  }
});

// Cleanup Expired Appointments (Run periodically, e.g., via cron job)
const cleanupExpiredAppointments = async () => {
  try {
    await db.promise().query(
      "DELETE FROM appointments WHERE status = 'Pending Payment' AND created_at < NOW() - INTERVAL 15 MINUTE"
    );
    console.log("Expired appointments cleaned up.");
  } catch (error) {
    console.error("Error cleaning up expired appointments:", error);
  }
};

// Run cleanup every 5 minutes (for demo purposes; use a proper scheduler like node-cron in production)
setInterval(cleanupExpiredAppointments, 5 * 60 * 1000);

module.exports = router;