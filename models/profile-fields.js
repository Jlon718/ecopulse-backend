// models/user/profileFields.js
module.exports = {
    gender: {
      type: String,
      enum: ["male", "female", "non-binary", "transgender", "other", "prefer-not-to-say"],
      default: "prefer-not-to-say"
    },
    avatar: {
      type: String,
      default: "default-avatar" // Default avatar identifier
    }
  };