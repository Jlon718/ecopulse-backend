const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const generateTokens = require("../utils/token");
const jwt = require('jsonwebtoken');
const admin = (require('../firebase/firebase'));
const { sendVerificationEmail, sendGoogleVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');
const crypto = require("crypto");

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

    try {
      // 3. Create user in Firebase if using Firebase
      let firebaseUser = null;
      try {
        firebaseUser = await admin.auth().createUser({
          email: email,
          password: password,
          displayName: `${firstName} ${lastName}`
        });
        console.log("Firebase user created:", firebaseUser.uid);
      } catch (firebaseError) {
        console.warn("Firebase user creation skipped or failed:", firebaseError.message);
        // Continue with MongoDB registration even if Firebase fails
      }

      // 4. Hash password for MongoDB
      const hashedPassword = await bcrypt.hash(password, 10);

      // 5. Create unverified user in MongoDB
      const user = new User({
        firstName,
        lastName,
        email,
        password: hashedPassword,
        phone,
        googleId: firebaseUser?.uid || null, // Store Firebase UID if available
        isVerified: false // Set as unverified
      });

      await user.save();
      console.log("MongoDB user saved");

      // 6. Send verification email
      try {
        await sendVerificationEmail(user);
      } catch (emailError) {
        console.error("Error sending verification email:", emailError);
        // Continue even if email fails, but log the error
      }

      // 7. Send success response (but don't generate JWT token yet)
      res.status(201).json({
        success: true,
        message: "User registered successfully. Please check your email for verification instructions.",
        requireVerification: true,
        userId: user._id
      });
    } catch (error) {
      console.error("User creation failed:", error);
      return res.status(500).json({
        success: false,
        message: "Registration failed",
        error: error.message
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

    // Check if user is verified
    if (!user.isVerified) {
      // Resend verification email
      try {
        await sendVerificationEmail(user);
      } catch (emailError) {
        console.error("Error resending verification email:", emailError);
      }

      return res.status(401).json({
        success: false,
        message: "Your account is not verified. We've sent a new verification code to your email.",
        requireVerification: true,
        userId: user._id
      });
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

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: "Your account is not verified",
        requireVerification: true,
        userId: user._id
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
};

// Logout
// Updated Logout Function for authController.js

// Logout
exports.logout = (req, res) => {
  console.log("=== LOGOUT ENDPOINT CALLED ===");
  console.log("Clearing all auth cookies");
  
  // Get the full details of how the cookies were set from token.js
  // This is critical - the options must match EXACTLY
  
  // 1. Clear main auth token cookie with matching options
  res.clearCookie('token', {
    httpOnly: true,
    secure: false, // IMPORTANT: This must match how it was set
    sameSite: 'lax', 
    path: '/' // Default path if not specified when set
  });
  console.log("Cleared 'token' cookie");
  
  // 2. Clear refresh token cookie with matching options
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none', // IMPORTANT: must match how it was set
    path: '/' // Default path if not specified when set
  });
  console.log("Cleared 'refreshToken' cookie");
  
  // 3. Try alternative options for maximum compatibility
  // Sometimes browsers need different combinations
  
  // Default cookie clear (no options)
  res.clearCookie('token');
  res.clearCookie('refreshToken');
  console.log("Also cleared cookies with no options");
  
  // Try with different sameSite options
  ['strict', 'lax', 'none'].forEach(sameSite => {
    [true, false].forEach(secure => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: secure,
        sameSite: sameSite
      });
      
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: secure,
        sameSite: sameSite
      });
    });
  });
  console.log("Attempted to clear cookies with all sameSite/secure combinations");
  
  // 4. Send success response with instruction to clear localStorage
  res.json({ 
    success: true, 
    message: "Logged out successfully",
    clearLocalStorage: true // Signal frontend to clear localStorage
  });
  
  console.log("=== LOGOUT COMPLETED ===");
};

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

      // *** CRITICAL CHECK *** - Check if the user is verified
      if (!user.isVerified) {
        // Send verification email
        try {
          await sendGoogleVerificationEmail(user);
        } catch (emailError) {
          console.error("Error sending Google verification email:", emailError);
        }

        console.log("User requires verification:", user._id);
        return res.status(200).json({
          success: false,
          requireVerification: true,
          userId: user._id,
          user: {
            email: user.email
          },
          message: "Please verify your email to complete Google sign-in"
        });
      }
      
      // If we get here, user exists and is verified
      console.log("User is verified, proceeding with login");
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
        isVerified: false // Set as unverified
      });
      
      await user.save();

      // Send verification email
      try {
        await sendGoogleVerificationEmail(user);
      } catch (emailError) {
        console.error("Error sending Google verification email:", emailError);
      }

      console.log("New user created, requires verification:", user._id);
      return res.status(200).json({
        success: false,
        requireVerification: true,
        userId: user._id,
        user: {
          email: user.email
        },
        message: "Please verify your email to complete Google sign-in"
      });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Generate tokens
    const { accessToken } = generateTokens(user, res);
    
    // Return user data and token
    console.log("Successful Google sign-in for verified user:", user._id);
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
        isVerified: user.isVerified, // Make sure to include this!
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

// New endpoint for email verification
exports.verifyEmail = async (req, res) => {
  try {
    const { userId, verificationCode } = req.body;

    if (!userId || !verificationCode) {
      return res.status(400).json({
        success: false,
        message: "User ID and verification code are required"
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if already verified
    if (user.isVerified) {
      return res.json({
        success: true,
        message: "Email already verified",
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        }
      });
    }

    // Check verification code
    if (user.verificationCode !== verificationCode) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification code"
      });
    }

    // Check if code is expired
    if (user.verificationCodeExpires && user.verificationCodeExpires < new Date()) {
      // Generate a new code and send it
      try {
        await sendVerificationEmail(user);
      } catch (emailError) {
        console.error("Error resending verification email:", emailError);
      }

      return res.status(400).json({
        success: false,
        message: "Verification code has expired. A new code has been sent to your email."
      });
    }

    // Verify the user
    user.isVerified = true;
    user.verificationCode = undefined; // Clear the code
    user.verificationCodeExpires = undefined;
    await user.save();

    // Generate tokens
    const { accessToken } = generateTokens(user, res);

    // Return success
    res.json({
      success: true,
      message: "Email verification successful",
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
    console.error("Email verification error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

// Resend verification code
exports.resendVerificationCode = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required"
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if already verified
    if (user.isVerified) {
      return res.json({
        success: true,
        message: "Email already verified"
      });
    }

    // Send new verification email
    try {
      await sendVerificationEmail(user);
    } catch (emailError) {
      console.error("Error resending verification email:", emailError);
      return res.status(500).json({
        success: false,
        message: "Failed to send verification email",
        error: emailError.message
      });
    }

    res.json({
      success: true,
      message: "Verification code has been resent to your email"
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: "Email is required" 
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      // To prevent user enumeration, respond with a success message
      return res.status(200).json({
        success: true,
        message: "If that email address is in our database, we will send a password reset link."
      });
    }

    // Generate a reset token (using crypto for randomness)
    const resetToken = crypto.randomBytes(20).toString("hex");
    user.resetPasswordToken = resetToken;
    // Token expires in 1 hour (3600000 milliseconds)
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();

    // Send password reset email (create this utility similar to your verification emails)
    try {
      await sendPasswordResetEmail(user, resetToken);
    } catch (emailError) {
      console.error("Error sending password reset email:", emailError);
      return res.status(500).json({
        success: false,
        message: "Error sending password reset email",
        error: emailError.message
      });
    }

    res.status(200).json({
      success: true,
      message: "If that email address is in our database, we will send a password reset link."
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Token and new password are required." 
      });
    }

    // Find user with matching token and check token expiration
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Password reset token is invalid or has expired."
      });
    }

    // Hash the new password using bcrypt
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    // Clear the reset token fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Optionally generate a new JWT for immediate login
    const { accessToken } = generateTokens(user, res);

    res.json({
      success: true,
      message: "Password has been successfully reset.",
      accessToken
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

