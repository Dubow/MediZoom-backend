const nodemailer = require("nodemailer");

// Create transporter once (no need to recreate it for every email)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  // Add TLS options to handle Gmail's requirements
  tls: {
    rejectUnauthorized: false, // Helpful for testing, remove in production with proper certificates
  },
});

// Verify transporter setup on startup
transporter.verify((error, success) => {
  if (error) {
    console.error("SMTP Transporter Error:", error);
  } else {
    console.log("SMTP Transporter Ready:", success);
  }
});

const sendEmail = async (to, subject, text) => {
  try {
    const mailOptions = {
      from: `Medizoom <${process.env.EMAIL_USER}>`, // Add a friendly sender name
      to,
      subject,
      text,
      // Optional: Add HTML for better formatting
      html: `<p>${text}</p><p>Thank you,<br>Medizoom Team</p>`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}: ${info.response} (Message ID: ${info.messageId})`);
    return info.response;
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, {
      message: error.message,
      code: error.code,
      response: error.response,
    });
    throw new Error(`Email sending failed: ${error.message}`);
  }
};

module.exports = sendEmail;