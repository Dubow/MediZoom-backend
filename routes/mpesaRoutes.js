const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config(); // Load environment variables

const mpesaRouter = express.Router();

// M-Pesa Payment Request Route
mpesaRouter.post("/initiate-payment", async (req, res) => {
  console.log("M-Pesa initiate-payment request body:", req.body);
  console.log("Initiate payment route hit!");
  try {
      const { amount, phoneNumber, accountReference, transactionDesc } = req.body;

      if (!amount || !phoneNumber || !accountReference) {
          return res.status(400).json({ error: "Missing required parameters (amount, phoneNumber, accountReference)." });
      }

      const headers = {
          Authorization: `Bearer ${await getAccessToken()}`,
          "Content-Type": "application/json",
      };

      const paymentData = {
          BusinessShortCode: process.env.MPESA_SHORTCODE,
          LipaNaMpesaOnlineShortcode: process.env.MPESA_SHORTCODE,
          Timestamp: new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14),
          TransactionType: "CustomerPayBillOnline",
          Amount: amount,
          PartyA: phoneNumber,
          PartyB: process.env.MPESA_SHORTCODE,
          PhoneNumber: phoneNumber,
          CallBackURL: process.env.MPESA_LIPA_RESULT_URL,
          AccountReference: accountReference,
          TransactionDesc: transactionDesc || "Payment for appointment",
      };
      console.log("M-Pesa Payment Data:", paymentData);

      // Generate the password
      const password = Buffer.from(
          process.env.MPESA_SHORTCODE + process.env.MPESA_LIPA_PASSKEY + paymentData.Timestamp
      ).toString("base64");

      paymentData.Password = password; // Add the password to the payment data

      const response = await axios.post(process.env.MPESA_LIPA_URL, paymentData, { headers });

      if (response.data) {
          console.log("M-Pesa response:", response.data);
          return res.json({ message: "Payment initiated successfully", paymentDetails: response.data });
      } else {
          console.error("M-Pesa initiation failed. No response data.");
          return res.status(400).json({ error: "Payment initiation failed: No response from M-Pesa API." });
      }
  } catch (error) {
      console.error("Error initiating payment:", error);
      return res.status(500).json({ error: `Server error: ${error.message}` });
  }
});

// M-Pesa Payment Result Callback
mpesaRouter.post("/result", (req, res) => {
    const result = req.body;
    console.log("M-Pesa callback result:", result);

    // Process the result here (e.g., store payment details in DB, update user)
    if (result?.Body?.stkCallback?.ResultCode === 0) {
        // Successful payment
        console.log("Payment success:", result);
        res.json({ message: "Payment successful", result: result.Body.stkCallback });
    } else {
        // Failed payment
        console.error("Payment failed:", result);
        res.status(400).json({ message: "Payment failed", result: result?.Body?.stkCallback });
    }
});

// Function to get the access token required by the M-Pesa API
async function getAccessToken() {
    const url = process.env.MPESA_OAUTH_URL; // Use environment variable
    const auth = Buffer.from(`${process.env.MPESA_LIPA_KEY}:${process.env.MPESA_LIPA_SECRET}`).toString('base64'); // Correct variable names

    try {
        const response = await axios.get(url, {
            headers: {
                Authorization: `Basic ${auth}`,
            }
        });

        return response.data.access_token;
    } catch (error) {
        console.error("Error getting access token:", error);
        throw error; // Re-throw the error to be handled in the main route
    }
}

module.exports = mpesaRouter;