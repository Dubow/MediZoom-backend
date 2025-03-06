const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const db = require("../config/db");

dotenv.config(); // Load environment variables

const mpesaRouter = express.Router();

// M-Pesa Payment Request Route
mpesaRouter.post("/initiate-payment", async (req, res) => {
    console.log("M-Pesa initiate-payment request body:", req.body);
    console.log("Initiate payment route hit!");

    try {
        const { amount, doctorId, accountReference, transactionDesc, clientPhoneNumber } = req.body;

        if (!amount || !doctorId || !accountReference || !clientPhoneNumber) {
            return res.status(400).json({ error: "Missing required parameters (amount, doctorId, accountReference, clientPhoneNumber)." });
        }

        // Fetch the doctor's details from the database (you might need doctorId for other purposes)
        const [doctorData] = await db.promise().query(
            "SELECT id FROM doctor_profile WHERE user_id = ?",
            [doctorId]
        );

        if (!doctorData || doctorData.length === 0) {
            return res.status(404).json({ error: "Doctor profile not found." });
        }

        const headers = {
            Authorization: `Bearer ${await getAccessToken()}`,
            "Content-Type": "application/json",
        };

        const paymentData = {
            BusinessShortCode: process.env.MPESA_SHORTCODE, // Your paybill number
            LipaNaMpesaOnlineShortcode: process.env.MPESA_SHORTCODE, // Your paybill number
            Timestamp: new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14),
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: `254${clientPhoneNumber.substring(1)}`, // Client's phone number
            PartyB: process.env.MPESA_SHORTCODE, // Your paybill number
            PhoneNumber: `254${clientPhoneNumber.substring(1)}`, // Client's phone number
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

// M-Pesa B2C Withdrawal Route
mpesaRouter.post("/withdraw", async (req, res) => {
    try {
        const { doctorId, amount } = req.body;

        // Fetch doctor's M-Pesa number from the database
        const [doctorData] = await db.promise().query(
            "SELECT phone FROM doctor_profile WHERE user_id = ?",
            [doctorId]
        );

        if (!doctorData || doctorData.length === 0) {
            return res.status(404).json({ error: "Doctor profile not found." });
        }

        const doctorMpesaNumber = doctorData[0].phone;

        if (!doctorMpesaNumber) {
            return res.status(400).json({ error: "Doctor's M-Pesa number not found." });
        }

        const accessToken = await getAccessToken();

        const initiatorName = process.env.MPESA_B2C_INITIATOR_NAME;
        const securityCredential = process.env.MPESA_B2C_SECURITY_CREDENTIAL;
        const shortCode = process.env.MPESA_SHORTCODE;
        const queueTimeoutURL = process.env.MPESA_B2C_QUEUE_TIMEOUT_URL;
        const resultURL = process.env.MPESA_B2C_RESULT_URL;

        // Encrypt security credential
        const encryptedSecurityCredential = CryptoJS.AES.encrypt(securityCredential, shortCode).toString();

        const b2cData = {
            InitiatorName: initiatorName,
            SecurityCredential: encryptedSecurityCredential,
            CommandID: "BusinessPayment",
            Amount: amount,
            PartyA: shortCode,
            PartyB: doctorMpesaNumber,
            Remarks: "Doctor Withdrawal",
            QueueTimeOutURL: queueTimeoutURL,
            ResultURL: resultURL,
            Occasion: "Withdrawal",
        };

        const headers = {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        };

        const response = await axios.post(process.env.MPESA_B2C_URL, b2cData, { headers });

        console.log("M-Pesa B2C Response:", response.data);

        res.json({ message: "Withdrawal initiated successfully", withdrawalDetails: response.data });
    } catch (error) {
        console.error("Error initiating withdrawal:", error);
        res.status(500).json({ error: `Server error: ${error.message}` });
    }
});

// M-Pesa B2C Queue Timeout Callback (Optional)
mpesaRouter.post("/b2c/timeout", (req, res) => {
    console.log("M-Pesa B2C Queue Timeout:", req.body);
    res.sendStatus(200);
});

// M-Pesa B2C Result Callback
mpesaRouter.post("/b2c/result", (req, res) => {
    console.log("M-Pesa B2C Result:", req.body);
    res.sendStatus(200);
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