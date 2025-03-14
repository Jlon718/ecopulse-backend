const express = require("express");
require("dotenv").config();
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const userRoutes = require("./routes/userRoutes");
const ticketRoutes = require("./routes/ticketRoutes");
const app = express();



app.use(
  cors({
    origin: [
      "http://localhost:5173", // Web (Vite/React)
      "http://192.168.1.3:5000", // Mobile
      "http://192.168.1.3:5173"  // Web access from another device on the same network
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);


app.use(cookieParser());
// Middleware to parse JSON
app.use(express.json());

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.log("DB not connected", err);
  });

// Initialize Firebase Admin SDK

// Authentication Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use('/api/users', userRoutes);
app.use('/api/ticket', ticketRoutes);

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://192.168.1.3:${PORT} (For Mobile)`);
  console.log(`Server also accessible at http://localhost:${PORT} (For Web)`);
});


// Export app for listing routes without running the server
module.exports = app;