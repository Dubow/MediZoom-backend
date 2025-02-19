const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config(); // Load environment variables

const router = express.Router();

// M-Pesa Payment Request Route
router.post("/initiate-payment", async (req, res) => {
  try {
    const { amount, phoneNumber, accountReference, transactionDesc } = req.body;

    // Prepare the M-Pesa request data
    const headers = {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/json",
    };

    const paymentData = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      LipaNaMpesaOnlineShortcode: process.env.MPESA_SHORTCODE,
      LipaNaMpesaOnlineShortcodeSecret: process.env.MPESA_LIPA_SECRET,
      Amount: amount,
      PhoneNumber: phoneNumber,
      AccountReference: accountReference,
      TransactionDesc: transactionDesc,
      // other required details
    };

    const response = await axios.post(process.env.MPESA_LIPA_URL, paymentData, { headers });
    
    if (response.data) {
      return res.json({ message: "Payment initiated successfully", paymentDetails: response.data });
    } else {
      return res.status(400).json({ error: "Payment initiation failed" });
    }

  } catch (error) {
    console.error("Error initiating payment:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Function to get the access token required by the M-Pesa API
async function getAccessToken() {
  const url = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
  const auth = Buffer.from(`${process.env.MPESA_LIPA_KEY}:${process.env.MPESA_LIPA_SECRET}`).toString('base64');

  const response = await axios.get(url, {
    headers: {
      Authorization: `Basic ${auth}`,
    }
  });

  return response.data.access_token;
}

module.exports = router;
