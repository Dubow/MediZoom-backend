const express = require("express");
const axios = require("axios");
const db = require("../config/db");
require("dotenv").config();

const mpesaRouter = express.Router();

// Function to get M-Pesa access token
async function getAccessToken() {
    const url = process.env.MPESA_OAUTH_URL;
    const auth = Buffer.from(`${process.env.MPESA_LIPA_KEY}:${process.env.MPESA_LIPA_SECRET}`).toString("base64");

    try {
        console.log("Requesting M-Pesa Access Token...");
        const response = await axios.get(url, {
            headers: { Authorization: `Basic ${auth}` },
        });
        console.log("M-Pesa Access Token Received:", response.data.access_token);
        return response.data.access_token;
    } catch (error) {
        console.error("Error getting access token:", error.response?.data || error.message);
        throw new Error("Failed to get access token");
    }
}

// Initiate M-Pesa Payment (STK Push)
mpesaRouter.post("/initiate-payment", async (req, res) => {
    console.log("M-Pesa Payment Request Received:", req.body);

    try {
        const { amount, doctorId, accountReference, clientPhoneNumber } = req.body;

        if (!amount || !doctorId || !accountReference || !clientPhoneNumber) {
            console.error("Missing parameters:", req.body);
            return res.status(400).json({ error: "Missing required parameters (amount, doctorId, accountReference, clientPhoneNumber)." });
        }

        // Validate Doctor Exists
        const [doctorData] = await db.promise().query("SELECT id FROM doctor_profile WHERE user_id = ?", [doctorId]);
        if (!doctorData.length) {
            console.error(`Doctor with ID ${doctorId} not found.`);
            return res.status(404).json({ error: "Doctor profile not found." });
        }

        // Validate Phone Number Format
        const phoneRegex = /^(\+254|0)7\d{8}$/;
        if (!phoneRegex.test(clientPhoneNumber)) {
            console.error(`Invalid phone number format: ${clientPhoneNumber}`);
            return res.status(400).json({ error: "Invalid phone number format. Use +2547XXXXXXXX or 07XXXXXXXX." });
        }

        const accessToken = await getAccessToken();
        console.log("Access Token Retrieved Successfully.");

        // Generate Timestamp and Password
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
        const password = Buffer.from(
            process.env.MPESA_SHORTCODE + process.env.MPESA_LIPA_PASSKEY + timestamp
        ).toString("base64");

        // Construct Payment Data (STK Push)
        const paymentData = {
            BusinessShortCode: process.env.MPESA_SHORTCODE,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: `254${clientPhoneNumber.substring(1)}`,
            PartyB: process.env.MPESA_SHORTCODE,
            PhoneNumber: `254${clientPhoneNumber.substring(1)}`,
            CallBackURL: process.env.MPESA_LIPA_RESULT_URL,
            AccountReference: accountReference,
            TransactionDesc: "Appointment Payment",
            Password: password,
        };

        console.log("Sending Payment Request to M-Pesa:", paymentData);

        const response = await axios.post(process.env.MPESA_LIPA_URL, paymentData, {
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        });

        console.log("M-Pesa Response:", response.data);
        return res.json({
            message: "Payment initiated successfully. Please complete the payment on your M-Pesa app.",
            paymentStatus: "Pending",
            paymentDetails: response.data,
        });
    } catch (error) {
        console.error("Error initiating payment:", error.response?.data || error.message);
        return res.status(500).json({ error: "Payment initiation failed." });
    }
});

// Handle M-Pesa Callback Results (STK Push Callback)
mpesaRouter.post("/result", async (req, res) => {
    console.log("M-Pesa Callback Received:", JSON.stringify(req.body, null, 2));

    const result = req.body;
    if (!result?.Body?.stkCallback) {
        console.error("Invalid callback structure:", result);
        return res.status(400).json({ ResultCode: 1, ResultDesc: "Invalid callback structure" });
    }

    const { ResultCode, ResultDesc } = result.Body.stkCallback;

    if (ResultCode === 0) {
        const { CheckoutRequestID, Amount, MpesaReceiptNumber, TransactionDate } = result.Body.stkCallback;
        const accountReference = result.Body.stkCallback.AccountReference;

        try {
            // Begin transaction
            await db.promise().query("START TRANSACTION");

            // Store payment details
            await db.promise().query(
                "INSERT INTO mpesa_payments (appointment_id, checkoutRequestID, amount, mpesa_receipt, transaction_date) VALUES (?, ?, ?, ?, ?)",
                [accountReference, CheckoutRequestID, Amount, MpesaReceiptNumber, TransactionDate]
            );

            // Update appointment status
            const [updateResult] = await db.promise().query(
                "UPDATE appointments SET status = 'Booked', payment_status = 'Completed', transaction_id = ? WHERE id = ? AND status = 'Pending Payment'",
                [MpesaReceiptNumber, accountReference]
            );

            if (updateResult.affectedRows === 0) {
                throw new Error("No matching appointment found or appointment status already updated.");
            }

            // Commit transaction
            await db.promise().query("COMMIT");

            console.log(`Payment Success for Appointment ID ${accountReference}:`, result.Body.stkCallback);
            res.json({ ResultCode: 0, ResultDesc: "Payment processed successfully" });
        } catch (error) {
            console.error("Error processing payment callback:", error.message);
            await db.promise().query("ROLLBACK");
            res.status(500).json({ ResultCode: 1, ResultDesc: "Failed to process payment" });
        }
    } else {
        console.error(`Payment Failed for Appointment ID ${result.Body.stkCallback?.AccountReference || "Unknown"}:`, ResultDesc);
        try {
            // Update appointment status to Failed (optional)
            if (result.Body.stkCallback?.AccountReference) {
                await db.promise().query(
                    "UPDATE appointments SET status = 'Failed', payment_status = 'Failed' WHERE id = ? AND status = 'Pending Payment'",
                    [result.Body.stkCallback.AccountReference]
                );
            }
            res.status(200).json({ ResultCode: 1, ResultDesc: "Payment failed" }); // Safaricom expects a 200 response
        } catch (error) {
            console.error("Error updating failed payment status:", error.message);
            res.status(200).json({ ResultCode: 1, ResultDesc: "Payment failed" });
        }
    }
});

module.exports = mpesaRouter;