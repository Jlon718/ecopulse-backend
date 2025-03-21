// routes/authRoutes.js
const express = require("express");
const { body } = require("express-validator");
const authController = require("../controllers/authController");
const accountController = require("../controllers/accountController");
const userController = require("../controllers/userController");

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const router = express.Router();

// Registration and login routes (no auth required)
router.post(
  "/register",
  [
    body("firstName", "First name is required").not().isEmpty(),
    body("lastName", "Last name is required").not().isEmpty(),
    body("email", "Valid email is required").isEmail(),
    body("password", "Password must be at least 6 characters").isLength({ min: 6 }),
  ],
  authController.register
);

router.post(
  "/login",
  [
    body("email", "Valid email is required").isEmail(),
    body("password", "Password is required").exists(),
  ],
  authController.login
);

// Password routes
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

// Account management routes
router.post("/deactivate-account", authMiddleware, accountController.deactivateAccount);
router.post("/reactivate-account", accountController.reactivateAccount);
router.post("/request-reactivation", accountController.requestReactivation);
router.post("/check-account-status", accountController.checkAccountStatus);
router.post("/check-deactivated", accountController.checkDeactivatedAccount);

// Google Authentication endpoint (no auth required)
router.post("/google-signin", authController.googleSignIn);

// Email verification endpoints (no auth required for direct verification)
router.post("/verify-email", authController.verifyEmail);

// Resend verification requires auth but not verification
router.post("/resend-verification", authController.resendVerificationCode);

// Logout (no auth required)
router.post("/logout", authController.logout);

// Check auth status (requires auth)
router.get('/verify', authMiddleware, authController.verifyAuth);

// Admin routes (require auth and admin role)
router.get('/users', authMiddleware, adminMiddleware, userController.getAllUsers);
router.put('/users/:userId/role', authMiddleware, adminMiddleware, userController.updateUserRole);
router.post('/admin/deactivate-user', authMiddleware, adminMiddleware, accountController.adminDeactivateUser);

// Debug routes
router.get('/debug/email-service', accountController.debugEmailService);
router.get('/debug/deactivated-accounts', authMiddleware, adminMiddleware, accountController.debugAutoDeactivatedAccounts);

module.exports = router;