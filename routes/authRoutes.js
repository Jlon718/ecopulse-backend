const express = require("express");
const { body } = require("express-validator");
const { register, login, verifyAuth, logout} = require("../controllers/authController");
const {getAllUsers, updateUserRole} = require("../controllers/userController")

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware")
const router = express.Router();

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


router.post("/logout", (req, res) => {
  
  res.clearCookie("token",{
    path: "/",
    httpOnly: true,
    sameSite: "none",
    secure: false,
  });
  res.json({
    success: true,
    message: "Logged out successfully. Please remove the token on the client side.",
  });
});

router.get('/verify',  verifyAuth)
router.get('/users', getAllUsers)
router.put('/users/:userId/role', authMiddleware, adminMiddleware, updateUserRole);
module.exports = router;
