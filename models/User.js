const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  // ... existing fields ...
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  password: { 
    type: String, 
    required: function() {
      // Password is required unless the user is using OAuth
      return !this.googleId;
    }
  },
  googleId: { type: String },
  profilePicture: { type: String },
  role: {
    type: String,
    default: "user",
    enum: ["user", "admin"]
  },
  lastLogin: {
    type: Date,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
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
  // *** New Fields for Reset Password ***
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpires: {
    type: Date
  },
  originalEmail: { type: String },
  originalPhone: { type: String }
}, { timestamps: true });


// Virtual for full name
UserSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Skip deleted users in queries
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
module.exports = mongoose.model("User", UserSchema);
