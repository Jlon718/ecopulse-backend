const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");

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

    // Token for immediate login
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "1h"
    });
    console.log("Line 43 - Token created");

    console.log("Line 45 - About to send response");
    res.status(201).json({ 
      success: true, 
      message: "User registered successfully", 
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role,
        phone: user.phone || ""
      },
      token
    });
    console.log("Line 57 - Response sent");

  } catch (error) {
    console.error("Registration Error:", error);
    console.error("Error occurred at line:", new Error().stack);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};



  exports.login = async (req, res) => { 
    const errors = validationResult(req); 
    if (!errors.isEmpty()) { 
      return res.status(400).json({ success: false, errors: errors.array() }); 
    } 

    const { email, password } = req.body; 

    try { 
      const user = await User.findOne({ email }); 
      if (!user) { 
        return res.status(400).json({ success: false, message: "Invalid credentials" }); 
      } 

      const isMatch = await bcrypt.compare(password, user.password); 
      if (!isMatch) { 
        return res.status(400).json({ success: false, message: "Invalid credentials" }); 
      } 

      const accessToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
        expiresIn: "1h"
      });

      const refreshToken = jwt.sign({ userId: user.id }, process.env.JWT_REFRESH_SECRET, {
        expiresIn: "7d"
      });
      
      
      
      res.cookie("token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // set to true in production (HTTPS)
        sameSite: "none", // needed for cross-site cookies; adjust if not needed
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      });
    
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      });

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
          accessToken
        } 
      }); 
    } catch (error) { 
      console.error("Login Error:", error.message); 
      res.status(500).json({ success: false, message: "Server error", error: error.message }); 
    } 
  };
