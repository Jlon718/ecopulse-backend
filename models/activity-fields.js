// models/user/activityFields.js
module.exports = {
    lastLogin: {
      type: Date,
      default: null
    },
    lastActivity: {
      type: Date,
      default: Date.now
    }
  };