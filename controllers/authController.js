// controllers/authController.js
const User = require("../models/User");
const mongoose = require('mongoose');
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const generateTokens = require("../utils/token");
const jwt = require('jsonwebtoken');
const admin = (require('../firebase/firebase'));
const { 
  sendVerificationEmail, 
  sendGoogleVerificationEmail, 
  sendPasswordResetEmail,
  sendReactivationConfirmationEmail 
} = require('../utils/emailService');
const crypto = require("crypto");

exports.register = async (req, res) => {
  try {
    console.log("Starting registration process...");
    
    // 1. Validate request body
    const { firstName, lastName, email, password, gender, avatar } = req.body;
    
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "All fields are required" 
      });
    }

    // 2. Check if user exists in MongoDB (including deactivated users)
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const existingUser = await usersCollection.findOne({ email });
    
    if (existingUser) {
      // Check if account is auto-deactivated - if so, return special message
      if (existingUser.isAutoDeactivated) {
        return res.status(400).json({
          success: false,
          message: "This email is associated with a deactivated account. Please login to reactivate.",
          isAutoDeactivated: true
        });
      }
      
      return res.status(400).json({ 
        success: false, 
        message: "User with this email already exists" 
      });
    }

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

    // 5. Upload avatar to Cloudinary
    let avatarUrl = "default-avatar"; // Default avatar URL
    if (avatar) {
      try {
        const uploadResponse = await cloudinary.uploader.upload(avatar, {
          folder: 'ecopulse_avatars',
          public_id: `${email}_${Date.now()}`, // Generate a unique public_id for each user
          transformation: [{ width: 500, height: 500, crop: 'limit' }]
        });
        avatarUrl = uploadResponse.secure_url;
        console.log("Avatar uploaded to Cloudinary:", avatarUrl);
      } catch (uploadError) {
        console.error("Error uploading avatar to Cloudinary:", uploadError);
      }
    }

    // 6. Create unverified user in MongoDB
    const user = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      googleId: firebaseUser?.uid || null, // Store Firebase UID if available
      gender: gender || "prefer-not-to-say",
      avatar: avatarUrl,
      isVerified: false, // Set as unverified
      lastActivity: new Date() // Set initial activity time
    });

    await user.save();
    console.log("MongoDB user saved:", user);

    // Verify that the user is saved correctly
    const savedUser = await User.findById(user._id);
    if (!savedUser) {
      console.error("User not found after saving:", user._id);
      return res.status(500).json({
        success: false,
        message: "Error saving user"
      });
    }

    // 7. Send verification email using the existing email service
    try {
      // Import the email service here to avoid any module loading issues
      const emailService = require('../utils/emailService');
      console.log("Email service imported, calling sendVerificationEmail...");
      
      // Explicitly call the function from the imported module
      const result = await emailService.sendVerificationEmail(user);
      console.log("Email service result:", result);
    } catch (emailError) {
      console.error("Error sending verification email:", emailError);
      console.error("Error stack:", emailError.stack);
      // Continue even if email fails, but log the error
    }

    // 8. Send success response (but don't generate JWT token yet)
    res.status(201).json({
      success: true,
      message: "User registered successfully. Please check your email for verification instructions.",
      requireVerification: true,
      userId: user._id
    });
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error
      return res.status(400).json({
        success: false,
        message: "Email is already registered"
      });
    }
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
    console.log(`Login attempt for email: ${email}`);

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and password are required" 
      });
    }

    // Try to find the user regardless of isDeleted status first
    // Use a direct MongoDB query to bypass any Mongoose filters
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const rawUser = await usersCollection.findOne({ email: email });
    
    console.log("Raw DB query result:", rawUser ? {
      id: rawUser._id.toString(),
      email: rawUser.email,
      isDeleted: !!rawUser.isDeleted,
      isAutoDeactivated: !!rawUser.isAutoDeactivated,
      hasPassword: !!rawUser.password
    } : "No user found");

    // If no user found at all, return invalid credentials
    if (!rawUser) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    // Check if account is auto-deactivated
    if (rawUser.isAutoDeactivated === true) {
      console.log("Found auto-deactivated account for login:", rawUser.email);
      
      // Check if the password matches
      const isMatch = await bcrypt.compare(password, rawUser.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: "Invalid credentials" });
      }
      
      // Password matches and account is auto-deactivated, reactivate it
      await usersCollection.updateOne(
        { _id: rawUser._id },
        { 
          $set: {
            isAutoDeactivated: false,
            autoDeactivatedAt: null,
            reactivationToken: null,
            reactivationTokenExpires: null,
            lastActivity: new Date(),
            lastLogin: new Date()
          }
        }
      );
      
      console.log("Auto-deactivated account reactivated during login");
      
      // Try to send reactivation confirmation email
      try {
        // Convert raw user to a format expected by the email service
        const userForEmail = {
          _id: rawUser._id,
          email: rawUser.email,
          firstName: rawUser.firstName || '',
          lastName: rawUser.lastName || ''
        };
        
        await sendReactivationConfirmationEmail(userForEmail);
        console.log("Sent reactivation confirmation email to:", email);
      } catch (emailError) {
        console.error("Error sending reactivation email:", emailError);
      }
      
      // Get the updated user for token generation
      const reactivatedUser = await User.findById(rawUser._id);
      if (!reactivatedUser) {
        return res.status(500).json({ 
          success: false, 
          message: "Error retrieving reactivated user"
        });
      }
      
      // Generate tokens using the utility function
      const { accessToken } = generateTokens(reactivatedUser, res);
      
      // Return success response with reactivation info
      return res.status(200).json({
        success: true,
        message: "Your account has been reactivated. Welcome back!",
        wasReactivated: true,
        user: {
          id: reactivatedUser._id,
          firstName: reactivatedUser.firstName,
          lastName: reactivatedUser.lastName,
          email: reactivatedUser.email,
          gender: reactivatedUser.gender,
          avatar: reactivatedUser.avatar,
          role: reactivatedUser.role,
          lastLogin: new Date(),
          isVerified: reactivatedUser.isVerified === true,
          accessToken
        }
      });
    }

    // If we found a raw user with isDeleted=true, reject login
    if (rawUser.isDeleted === true) {
      console.log("Found deleted account through raw query:", rawUser.email);
      return res.status(400).json({ 
        success: false, 
        message: "This account has been deleted and cannot be used." 
      });
    }

    // Continue with normal flow using the raw user data
    // Check password match
    const isMatch = await bcrypt.compare(password, rawUser.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    // Log the actual verification status from the database
    console.log('User verification status from database:', {
      email: rawUser.email,
      isVerified: rawUser.isVerified,
      verificationCode: rawUser.verificationCode || 'none'
    });

    // Update last login and activity time
    await usersCollection.updateOne(
      { _id: rawUser._id },
      { $set: { 
          lastLogin: new Date(),
          lastActivity: new Date()
        } 
      }
    );

    // For token generation, convert raw user to Mongoose model
    // This is needed because generateTokens expects a Mongoose model
    const User = mongoose.model('User');
    const user = new User(rawUser);

    // Generate tokens using the utility function
    const { accessToken } = generateTokens(user, res);

    // Prepare response data
    const responseData = {
      success: true,
      message: "Login successful",
      user: {
        id: rawUser._id,
        firstName: rawUser.firstName,
        lastName: rawUser.lastName,
        email: rawUser.email,
        gender: rawUser.gender || "prefer-not-to-say",
        avatar: rawUser.avatar || "default-avatar",
        role: rawUser.role,
        lastLogin: new Date(),
        // IMPORTANT: Explicitly set isVerified based on database value
        isVerified: rawUser.isVerified === true,
        accessToken
      }
    };
    
    // Log the response before sending
    console.log('Sending login response:', JSON.stringify(responseData));

    // Check if user is NOT verified and only then add requireVerification flag
    if (rawUser.isVerified !== true) {
      // Resend verification email
      try {
        await sendVerificationEmail(user);
      } catch (emailError) {
        console.error("Error resending verification email:", emailError);
      }

      responseData.requireVerification = true;
      responseData.message = "Your account is not verified. We've sent a new verification code to your email.";
    }

    // Send the response
    res.json(responseData);
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

    // Update user's last activity
    user.lastActivity = new Date();
    await user.save();

    res.json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        gender: user.gender,
        avatar: user.avatar,
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
      
      // Verify that the token belongs to the correct user (just log warning if mismatch)
      if (decodedToken.uid !== uid) {
        console.warn("Token UID mismatch:", { tokenUid: decodedToken.uid, requestUid: uid });
      }
    } catch (error) {
      console.error("Firebase token verification failed:", error);
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token"
      });
    }
    
    // First check if there's any user with this email, including auto-deactivated ones
    let user = null;
    try {
      // This will find the user even if they're auto-deactivated
      const db = mongoose.connection.db;
      const usersCollection = db.collection('users');
      user = await usersCollection.findOne({ email: email });
      
      console.log(`User lookup for ${email}:`, user ? `Found (isAutoDeactivated: ${user.isAutoDeactivated})` : "Not found");
    } catch (findError) {
      console.error("Error finding user:", findError);
    }
    
    // If we found an auto-deactivated user, handle reactivation
    if (user && user.isAutoDeactivated) {
      console.log("Found auto-deactivated account for Google sign-in:", email);
      
      // Reactivate the account
      await User.findByIdAndUpdate(user._id, {
        isAutoDeactivated: false,
        autoDeactivatedAt: null,
        reactivationToken: null,
        reactivationTokenExpires: null,
        lastActivity: new Date(),
        lastLogin: new Date(),
        googleId: uid, // Update or set Google ID
        avatar: photoURL || user.avatar // Update avatar if provided
      });
      
      console.log("Auto-deactivated account reactivated through Google sign-in");
      
      // Retrieve the updated user
      const reactivatedUser = await User.findById(user._id);
      
      // Send reactivation confirmation email
      try {
        await sendReactivationConfirmationEmail(reactivatedUser);
        console.log("Sent reactivation confirmation email to", email);
      } catch (emailError) {
        console.error("Error sending reactivation email:", emailError);
      }
      
      // Generate tokens for the reactivated user
      const { accessToken } = generateTokens(reactivatedUser, res);
      
      // Return success response with reactivation info
      return res.status(200).json({
        success: true,
        message: "Your account has been reactivated. Welcome back!",
        wasReactivated: true,
        user: {
          id: reactivatedUser._id,
          firstName: reactivatedUser.firstName,
          lastName: reactivatedUser.lastName,
          email: reactivatedUser.email,
          gender: reactivatedUser.gender,
          avatar: reactivatedUser.avatar,
          role: reactivatedUser.role,
          lastLogin: new Date(),
          isVerified: reactivatedUser.isVerified,
          accessToken
        }
      });
    }
    
    // If we found a deleted user, reject the sign-in
    if (user && user.isDeleted) {
      console.log("Found deleted account for Google sign-in:", email);
      return res.status(400).json({
        success: false,
        message: "This account has been deleted and cannot be used."
      });
    }
    
    // Normal flow for existing active users
    if (user && !user.isDeleted) {
      // Update Google ID and last activity if needed
      if (user.googleId !== uid || !user.lastActivity) {
        await User.findByIdAndUpdate(user._id, {
          googleId: uid,
          avatar: photoURL || user.avatar,
          lastActivity: new Date(),
          lastLogin: new Date()
        });
      }

      // Check if the user is verified
      if (!user.isVerified) {
        try {
          await sendGoogleVerificationEmail(user);
        } catch (emailError) {
          console.error("Error sending Google verification email:", emailError);
        }

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
      
      // User exists, is active, and is verified - update the user
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        { lastLogin: new Date(), lastActivity: new Date() },
        { new: true }
      );
      
      console.log("User is verified, proceeding with login");
      
      // Generate tokens
      const { accessToken } = generateTokens(updatedUser, res);
      
      // Return success response
      return res.json({
        success: true,
        message: "Google sign-in successful",
        user: {
          id: updatedUser._id,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          email: updatedUser.email,
          gender: updatedUser.gender,
          avatar: updatedUser.avatar,
          role: updatedUser.role,
          lastLogin: updatedUser.lastLogin,
          isVerified: updatedUser.isVerified,
          accessToken
        }
      });
    } else if (!user) {
      // No user exists - create new one
      console.log("Creating new user for Google sign-in:", email);
      
      // Parse display name
      let firstName = displayName || "Google";
      let lastName = "User";
      
      if (displayName && displayName.includes(' ')) {
        const nameParts = displayName.split(' ');
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ');
      }
      
      // Create new user
      try {
        user = new User({
          firstName,
          lastName,
          email,
          googleId: uid,
          avatar: photoURL || "default-avatar",
          gender: "prefer-not-to-say", // Default gender
          isVerified: false, // Set as unverified
          lastActivity: new Date(),
          lastLogin: new Date()
        });
        
        await user.save();
        console.log("New user created for Google sign-in:", user._id);
        
        // Send verification email for new user
        try {
          await sendGoogleVerificationEmail(user);
        } catch (emailError) {
          console.error("Error sending Google verification email:", emailError);
        }

        return res.status(200).json({
          success: false,
          requireVerification: true,
          userId: user._id,
          user: {
            email: user.email
          },
          message: "Please verify your email to complete Google sign-in"
        });
      } catch (dbError) {
        console.error("Error creating user for Google sign-in:", dbError);
        return res.status(500).json({
          success: false,
          message: "Error creating account",
          error: dbError.message
        });
      }
    }
    
    // This should never happen, but just in case
    throw new Error("Failed to process Google sign-in");
    
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

// Email verification endpoint
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
    user.lastActivity = new Date(); // Update last activity
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
        gender: user.gender,
        avatar: user.avatar,
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

    // Find user by email (check both active and auto-deactivated)
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ 
      email,
      isDeleted: { $ne: true } // Exclude permanently deleted users
    });
    
    if (!user) {
      // To prevent user enumeration, respond with a success message
      return res.status(200).json({
        success: true,
        message: "If that email address is in our database, we will send a password reset link."
      });
    }

    // If account is auto-deactivated, reactivate it
    let updatedUser = user;
    if (user.isAutoDeactivated) {
      // Reactivate the account
      await usersCollection.updateOne(
        { _id: user._id },
        { 
          $set: {
            isAutoDeactivated: false,
            autoDeactivatedAt: null,
            reactivationToken: null,
            reactivationTokenExpires: null,
            lastActivity: new Date()
          }
        }
      );
      
      // Get the updated user
      updatedUser = await User.findById(user._id);
      
      if (!updatedUser) {
        // Fallback to original user if we can't find the updated one
        updatedUser = new User(user);
      }
      
      console.log("Auto-deactivated account reactivated during password reset");
    } else {
      // If user is active, create a Mongoose model from the raw document
      updatedUser = new User(user);
    }

    // Generate a reset token (using crypto for randomness)
    const resetToken = crypto.randomBytes(20).toString("hex");
    updatedUser.resetPasswordToken = resetToken;
    // Token expires in 1 hour (3600000 milliseconds)
    updatedUser.resetPasswordExpires = Date.now() + 3600000;
    await updatedUser.save();

    // Send password reset email
    try {
      await sendPasswordResetEmail(updatedUser, resetToken);
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
    // Update last activity
    user.lastActivity = new Date();
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