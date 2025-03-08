  // Updated routes/userRoutes.js

  const express = require('express');
  const router = express.Router();
  const { 
    getUserById, 
    updateUserProfile, 
    changePassword, 
    softDeleteUser, 
    getAllUsersWithDeleted,
    restoreUser,
    deleteAllUsers,

  } = require('../controllers/userController');
  const authMiddleware = require('../middleware/authMiddleware');
  const adminMiddleware = require('../middleware/adminMiddleware');

  // Delete all users - NO AUTH REQUIRED
  // WARNING: This route is not protected and can delete all users
  router.delete('/deleteall', deleteAllUsers);

  // Authenticated routes
  // Get specific user by ID
  router.get('/:id', authMiddleware, getUserById);

  // Update user profile
  router.put('/:id', authMiddleware, updateUserProfile);

  // Change password
  router.put('/:id/password', authMiddleware, changePassword);

  // Soft delete user
  router.delete('/:id', authMiddleware, softDeleteUser);

  // Admin routes
  router.get('/users/all', authMiddleware, adminMiddleware, getAllUsersWithDeleted);
  router.put('/:id/restore', authMiddleware, adminMiddleware, restoreUser);
  module.exports = router;