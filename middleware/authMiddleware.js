const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  console.log("=== AUTH MIDDLEWARE STARTED ===");
  
  // Define public routes that don't need auth
  const publicRoutes = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/verify-email',
    '/api/auth/resend-verification',
    '/api/auth/reset-password',
    '/api/auth/forgot-password',
    '/api/auth/google-signin'
  ];

  // Skip middleware for public routes
  if (publicRoutes.includes(req.path)) {
    console.log(`Skipping auth for public route: ${req.path}`);
    return next();
  }

  // Get token from header or cookie
  let token = req.cookies?.token;
  const authHeader = req.header("Authorization");
  
  if (!token && authHeader) {
    token = authHeader.startsWith("Bearer ") 
      ? authHeader.split(" ")[1].trim() 
      : authHeader.trim();
  }

  if (!token) {
    console.log("No token found");
    return res.status(401).json({ 
      success: false, 
      message: "Authentication required" 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      console.log("User not found");
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // Check verification status for protected routes
    const protectedRoutes = [
      '/api/dashboard',
      '/api/admin',
      '/api/predictions'
    ];

    if (protectedRoutes.some(route => req.path.startsWith(route)) && !user.isVerified) {
      console.log("Unverified user attempting to access protected route");
      return res.status(401).json({
        success: false,
        message: "Email verification required",
        requireVerification: true,
        userId: user._id,
        email: user.email
      });
    }

    // Set user data on request
    req.user = {
      userId: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified
    };

    // Try to refresh token if it's close to expiring
    const tokenExp = decoded.exp * 1000;
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (tokenExp - now < fiveMinutes && req.cookies?.refreshToken) {
      try {
        const newToken = jwt.sign(
          { userId: user._id },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );

        res.cookie('token', newToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 3600000 // 1 hour
        });
      } catch (refreshError) {
        console.error("Token refresh failed:", refreshError);
      }
    }

    next();
  } catch (error) {
    console.error("Auth error:", error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: "Token expired",
        requireRefresh: true
      });
    }

    res.status(401).json({ 
      success: false, 
      message: "Invalid authentication" 
    });
  }
};