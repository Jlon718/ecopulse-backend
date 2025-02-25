const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const generateTokens = require("../utils/token");
const jwt = require('jsonwebtoken');



exports.register = async (req, res) => {
  try {
    console.log("Line 1");
    console.log("Received request body:", req.body);
    console.log("Line 3");

    // Destructure all fields from request body, including role
    const { firstName, lastName, email, password, phone, role } = req.body;
    console.log("Line 6 - After destructuring:", { firstName, lastName, email, phone, role });

    if (!firstName || !lastName || !email || !password) {
      console.log("Line 9 - Missing required fields");
      return res.status(400).json({ message: "All fields are required" });
    }

    console.log("Line 13");
    // Check if user exists
    const existingUser = await User.findOne({ email });
    console.log("Line 15 - Existing user check:", existingUser ? true : false);

    if (existingUser) {
      console.log("Line 17 - User exists");
      return res.status(400).json({ success: false, message: "User with this email already exists" });
    }

    console.log("Line 21");
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Line 23 - Password hashed");

    // Create new user with all fields from request
    console.log("Line 26 - About to create user");
    const user = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phone,
      // Don't use the spread operator for now to simplify
      role: role || undefined // This will fall back to schema default if undefined
    });

    console.log("Line 36 - User object created:", user);
    await user.save();
    console.log("Line 38 - User saved");

    // Generate tokens using the utility function
    const { accessToken } = generateTokens(user, res);
    console.log("Line 43 - Tokens created");

    console.log("Line 45 - About to send response");
    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        phone: user.phone || ""
      },
      token: accessToken
    });
    console.log("Line 57 - Response sent");

  } catch (error) {
    console.error("Registration Error:", error);
    console.error("Error occurred at line:", new Error().stack);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    // Extract email and password from request body
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and password are required" 
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    // Update last login time
    user.lastLogin = new Date();
    await user.save();

    // Generate tokens using the utility function
    const { accessToken } = generateTokens(user, res);

    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone || "",
        role: user.role,
        lastLogin: user.lastLogin,
        accessToken
      }
    });
  } catch (error) {
    console.error("Login Error:", error.message);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

exports.verifyAuth = async (req, res) => {
  try {
    console.log("=== VERIFYING AUTH ===");
    
    // Get token from either cookie or Authorization header
    const token = req.cookies.token || req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      console.log("No token found");
      return res.status(401).json({ 
        success: false, 
        message: "Authentication required" 
      });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Token decoded:", { userId: decoded.userId, role: decoded.role });

    // Find user with decoded info
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      console.log("No user found with decoded ID");
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone || "",
        role: user.role
      }
    });
    
    console.log("=== AUTH VERIFICATION COMPLETED ===");

  } catch (error) {
    console.error("Auth verification error:", error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid token" 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: "Token expired" 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: "Server Error",
      error: error.message 
    });
  }
};;

// Logout
exports.logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: false,
    sameSite: "lax"
  });
  
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none"
  });
  
  res.json({ success: true, message: "Logged out successfully" })
}