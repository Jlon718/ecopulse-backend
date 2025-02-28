const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const generateTokens = require("../utils/token");
const jwt = require('jsonwebtoken');
const admin = (require('../firebase/firebase'));



exports.register = async (req, res) => {
  try {
    console.log("Starting registration process...");
    
    // 1. Validate request body
    const { firstName, lastName, email, password, phone } = req.body;
    
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "All fields are required" 
      });
    }

    // 2. Check if user exists in MongoDB
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: "User with this email already exists" 
      });
    }

    // 3. Create user in Firebase
    try {
      const firebaseUser = await admin.auth().createUser({
        email: email,
        password: password,
        displayName: `${firstName} ${lastName}`
      });
      console.log("Firebase user created:", firebaseUser.uid);

      // 4. Hash password for MongoDB
      const hashedPassword = await bcrypt.hash(password, 10);

      // 5. Create user in MongoDB with Firebase UID
      const user = new User({
        firstName,
        lastName,
        email,
        password: hashedPassword,
        phone,
        googleId: firebaseUser.uid // Store Firebase UID
      });

      await user.save();
      console.log("MongoDB user saved");

      // 6. Generate JWT token
      const { accessToken } = generateTokens(user, res);

      // 7. Send success response
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
    } catch (firebaseError) {
      console.error("Firebase user creation failed:", firebaseError);
      // If Firebase creation fails, send error response
      return res.status(500).json({
        success: false,
        message: "Registration failed",
        error: firebaseError.message
      });
    }

  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
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


exports.googleSignIn = async (req, res) => {
  try {
    console.log("Google Sign-In request received");
    
    // Extract data from request body sent by the frontend
    const { idToken, email, displayName, photoURL, uid } = req.body;
    
    if (!idToken || !email) {
      return res.status(400).json({
        success: false,
        message: "Missing required information"
      });
    }
    
    // Verify Firebase token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
      
      // Verify that the token belongs to the correct user
      if (decodedToken.uid !== uid) {
        throw new Error("Token doesn't match user");
      }
    } catch (error) {
      console.error("Firebase token verification failed:", error);
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token"
      });
    }
    
    // Check if user exists
    let user = await User.findOne({ email });
    
    if (user) {
      // User exists, update Google ID if not already set
      if (!user.googleId) {
        user.googleId = uid;
        user.profilePicture = photoURL || user.profilePicture;
        await user.save();
      }
    } else {
      // User doesn't exist, create new user
      // Parse the display name into first and last name
      let firstName = displayName || "Google";
      let lastName = "User";
      
      if (displayName && displayName.includes(' ')) {
        const nameParts = displayName.split(' ');
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ');
      }
      
      user = new User({
        firstName,
        lastName,
        email,
        googleId: uid,
        profilePicture: photoURL,
        // No password needed for Google users
      });
      
      await user.save();
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Generate tokens
    const { accessToken } = generateTokens(user, res);
    
    // Return user data and token
    res.json({
      success: true,
      message: "Google sign-in successful",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone || "",
        role: user.role,
        profilePicture: user.profilePicture,
        lastLogin: user.lastLogin,
        accessToken
      }
    });
    
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};