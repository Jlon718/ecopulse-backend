// models/user/userMethods.js
module.exports = {
    // Virtual for full name
    fullName: function() {
      return `${this.firstName} ${this.lastName}`;
    },
    
    // Method to check if user account is inactive
    isInactive: function() {
      if (!this.lastActivity) return false;
      
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      return this.lastActivity < oneMonthAgo;
    },
    
    // Method to update last activity
    updateActivity: function() {
      this.lastActivity = new Date();
      return this.save();
    }
  };