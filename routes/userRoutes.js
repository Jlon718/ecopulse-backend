// Add to routes/userRoutes.js

const express = require('express');
const router = express.Router();
const { 
  getUserById, 
  updateUserProfile, 
  changePassword, 
  softDeleteUser, 
  getAllUsersWithDeleted,
  restoreUser
} = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
// Get specific user by ID
router.get('/:id', authMiddleware, getUserById);

// Update user profile
router.put('/:id', authMiddleware, updateUserProfile);

// Change password
router.put('/:id/password', authMiddleware, changePassword);

// Soft delete user
router.delete('/:id', authMiddleware, softDeleteUser);
// In your routes file (admin routes)
router.get('/users/all', authMiddleware, adminMiddleware, getAllUsersWithDeleted);
router.put('/users/:id/restore', authMiddleware, adminMiddleware, restoreUser);
module.exports = router;