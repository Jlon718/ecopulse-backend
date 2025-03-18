// routes/authRoutes.js
const express = require("express");
const { body } = require("express-validator");
const { 
  register, 
  login, 
  verifyAuth, 
  logout, 
  googleSignIn,
  verifyEmail,
  resendVerificationCode,
  forgotPassword,
  resetPassword
} = require("../controllers/authController");

const { 
  reactivateAccount,
  requestReactivation,
  checkAccountStatus,
  debugAutoDeactivatedAccounts,
  debugEmailService
} = require("../controllers/accountController");

const { 
  getAllUsers, 
  updateUserRole 
} = require("../controllers/userController");

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
  register
);

router.post(
  "/login",
  [
    body("email", "Valid email is required").isEmail(),
    body("password", "Password is required").exists(),
  ],
  login
);

// Password routes
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Account reactivation endpoints
router.post("/reactivate-account", reactivateAccount);
router.post("/request-reactivation", requestReactivation);
router.post("/check-account-status", checkAccountStatus);

// Google Authentication endpoint (no auth required)
router.post("/google-signin", googleSignIn);

// Email verification endpoints (no auth required for direct verification)
router.post("/verify-email", verifyEmail);

// Resend verification requires auth but not verification
router.post("/resend-verification", resendVerificationCode);

// Logout (no auth required)
router.post("/logout", logout);

// Check auth status (requires auth)
router.get('/verify', authMiddleware, verifyAuth);

// Admin routes (require auth and admin role)
router.get('/users', authMiddleware, adminMiddleware, getAllUsers);
router.put('/users/:userId/role', authMiddleware, adminMiddleware, updateUserRole);

// Debug routes (admin only in production)
router.get('/debug/email-service', debugEmailService);
router.get('/debug/deactivated-accounts', authMiddleware, adminMiddleware, debugAutoDeactivatedAccounts);

module.exports = router;