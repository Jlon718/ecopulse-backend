// models/user/statusFields.js
module.exports = {
    isDeactivated: {
      type: Boolean,
      default: false
    },
    isAutoDeactivated: {
      type: Boolean,
      default: false
    },
    autoDeactivatedAt: {
      type: Date,
      default: null
    }
  };