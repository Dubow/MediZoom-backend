
# MediZoom Backend 🩺💻

MediZoom is a full-stack **telemedicine platform** that enables patients and doctors to connect virtually. This backend repository powers the API for authentication, doctor-client interactions, appointment booking, and payment processing.

> 🚀 Built with Node.js, Express, and MySQL | JWT Auth | MPesa API Integration | Zoom API for video consultations

---

## 🔧 Features

- 🔐 **Authentication & Authorization**
  - Role-based signup/login (Doctors & Clients)
  - Email verification
  - Password reset via email
  - JWT-based session management

- 📅 **Appointments & Scheduling**
  - Clients can book available slots
  - Doctors can set and manage availability
  - Appointment status: pending, confirmed, completed, cancelled

- 💳 **Payments via MPesa**
  - Secure mobile payment integration
  - Prepaid appointments for booking confirmation

- 📹 **Zoom Video Consultation**
  - API integration for live virtual meetings between doctors and patients

- 📁 **Doctor Profile Management**
  - Specialization, availability, and bio
  - Prescription handling (upcoming)

---

## 📂 Project Structure

```
MediZoom-backend/
├── controllers/        # Business logic
├── models/             # Sequelize models (MySQL)
├── routes/             # Express routes for API endpoints
├── middleware/         # JWT auth, error handling
├── utils/              # MPesa, Zoom, email services
├── config/             # Database & environment setup
├── app.js              # Express server setup
└── README.md
```

---

## 🛠️ Tech Stack

- **Backend:** Node.js + Express
- **Database:** MySQL + Sequelize ORM
- **Authentication:** JWT, Bcrypt
- **Payments:** MPesa Daraja API
- **Video Calls:** Zoom API
- **Email Services:** Nodemailer
- **Deployment Ready:** Yes (can be deployed to Heroku, Render, etc.)

---

## 🚀 Getting Started

1. **Clone the repo**
   ```bash
   git clone https://github.com/Dubow/MediZoom-backend.git
   cd MediZoom-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run the server**
   ```bash
   npm start
   ```

---

## 🌍 API Endpoints (Sample)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/api/auth/signup` | Register doctor or client |
| POST   | `/api/auth/login`  | Login and get JWT token |
| GET    | `/api/doctors`     | List all available doctors |
| POST   | `/api/appointments/book` | Book appointment |
| POST   | `/api/payments/mpesa` | Initiate MPesa payment |
| POST   | `/api/zoom/create` | Generate Zoom meeting |

---

## 🙌 Contributions & Future Work

This project is actively being developed. Planned features:
- Prescription module
- Health record sharing
- Notification system (SMS & Email)

Contributions, suggestions, and feedback are welcome!

---

## 👨‍💻 Author

**Abdirahman Dubow**  
Student @ Shenyang University of Technology  
📫 [Connect on GitHub](https://github.com/Dubow)

---

## 📜 License

**MIT License**
