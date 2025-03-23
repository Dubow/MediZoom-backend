const bcrypt = require('bcryptjs');

const password = "Dubow585/"; // Replace with your desired password
bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error("Error hashing password:", err);
  } else {
    console.log("Hashed Password:", hash);
  }
});