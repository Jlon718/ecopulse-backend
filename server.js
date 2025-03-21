const express = require("express");
const path = require("path");
require("dotenv").config();
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const http = require("http");
const userRoutes = require("./routes/userRoutes");
const ticketRoutes = require("./routes/ticketRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const compression = require('compression');

// Define the PORT variable
const PORT = process.env.PORT || 5000;

const app = express();
// Create HTTP server
const server = http.createServer(app);

app.use(compression());
app.use(
  cors({
    origin: [
      "http://localhost:5173", // Web (Vite/React)
      "http://192.168.1.3:5000", // Mobile
      "http://192.168.1.3:5173"  // Web access from another device on the same network
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"], // Add PATCH for notification routes
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

app.use(cookieParser());
// Middleware to parse JSON
app.use(express.json({
  limit: '100mb',
  parameterLimit: 100000,
  extended: true
}));

app.use(express.urlencoded({
  limit: '100mb',
  parameterLimit: 100000,
  extended: true
}));

// Serve static files from a public directory
// This makes avatars accessible via URL for Cloudinary to fetch
app.use(express.static(path.join(__dirname, 'public')));

// If you're using React's build folder in production, add this
if (process.env.NODE_ENV === 'production') {
  // Assuming your React app is in a client folder at the same level as server
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// Set up specific static routes for avatars
app.use('/avatars', express.static(path.join(__dirname, 'public/avatars')));

// MongoDB Connection
const mongoUrl = process.env.MONGODB_URI;
if (!mongoUrl) {
  console.error("Error: MONGODB_URI environment variable is not set.");
  process.exit(1);
}

mongoose
  .connect(mongoUrl)
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.log("DB not connected", err);
  });

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use('/api/users', userRoutes);
app.use('/api/ticket', ticketRoutes);
app.use('/api/upload', uploadRoutes);

// Add a catch-all route for React router in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Use server.listen instead of app.listen
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://192.168.1.3:${PORT} (For Mobile)`);
  console.log(`Server also accessible at http://localhost:${PORT} (For Web)`);
  console.log(`Avatars accessible at http://localhost:${PORT}/avatars/avatar-1.png`);
});

// Export app for listing routes without running the server
module.exports = app;