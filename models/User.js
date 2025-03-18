// models/User.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { 
    type: String, 
    required: function() {
      // Password is required unless the user is using OAuth
      return !this.googleId;
    }
  },
  googleId: { type: String },
  
  // Gender field with inclusive options
  gender: {
    type: String,
    enum: ["male", "female", "non-binary", "transgender", "other", "prefer-not-to-say"],
    default: "prefer-not-to-say"
  },
  
  // Avatar selection instead of profile picture upload
  avatar: {
    type: String,
    default: "default-avatar" // Default avatar identifier
  },
  
  role: {
    type: String,
    default: "user",
    enum: ["user", "admin"]
  },
  lastLogin: {
    type: Date,
    default: null
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  // Auto-deactivation tracking
  isAutoDeactivated: {
    type: Boolean,
    default: false
  },
  autoDeactivatedAt: {
    type: Date,
    default: null
  },
  // Fields for email verification
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: {
    type: String
  },
  verificationCodeExpires: {
    type: Date
  },
  // Reset Password fields
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpires: {
    type: Date
  },
  // Account reactivation fields
  reactivationToken: {
    type: String,
    default: null
  },
  reactivationTokenExpires: {
    type: Date,
    default: null
  },
  reactivationAttempts: {
    type: Number,
    default: 0
  },
  lastReactivationAttempt: {
    type: Date,
    default: null
  },
  // Tracking original values for recovery
  originalEmail: { type: String }
}, { timestamps: true });

// Virtual for full name
UserSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Skip deleted users in queries UNLESS explicitly querying for them
UserSchema.pre(['find', 'findOne', 'findById'], function(next) {
  // Check if we're working with the "restore" method or directly accessing by ID
  if (this.getQuery() && this.getQuery().hasOwnProperty('isDeleted')) {
    // If we're directly querying for isDeleted value, don't modify the query
    return next();
  }
  
  // Otherwise, exclude deleted users
  this.where({ isDeleted: { $ne: true } });
  next();
});

// Method to check if user account is inactive
UserSchema.methods.isInactive = function() {
  if (!this.lastActivity) return false;
  
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  
  return this.lastActivity < oneMonthAgo;
};

// Method to update last activity
UserSchema.methods.updateActivity = function() {
  this.lastActivity = new Date();
  return this.save();
};

module.exports = mongoose.model("User", UserSchema);