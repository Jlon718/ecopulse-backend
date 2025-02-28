const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    password: { type: String, required: function() {
        // Password is required unless the user is using OAuth
        return !this.googleId;
    }},
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
    }
}, { timestamps: true });

// Add a virtual for full name
UserSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName}`;
});

// Skip deleted users in queries
UserSchema.pre(['find', 'findOne'], function(next) {
    // Add a condition to only find documents where isDeleted is not true
    this.where({ isDeleted: { $ne: true } });
    next();
});

module.exports = mongoose.model("User", UserSchema);