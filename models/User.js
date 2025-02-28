const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String},
    password: { type: String, required: true },
    role:{
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

module.exports = mongoose.model("User", UserSchema);

// Add a virtual for full name
UserSchema.pre(['find', 'findOne'], function(next) {
    // Add a condition to only find documents where isDeleted is not true
    this.where({ isDeleted: { $ne: true } });
    next();
});

UserSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName}`;
});