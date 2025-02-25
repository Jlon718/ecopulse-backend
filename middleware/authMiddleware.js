const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  console.log("=== AUTH MIDDLEWARE STARTED ===");
  
  // Try to get token from multiple sources
  let token;
  
  // Check Authorization header first
  const authHeader = req.header("Authorization");
  console.log("Authorization header:", authHeader);
  
  if (authHeader) {
    // Fix: Handle both "Bearer [token]" and just the token
    token = authHeader.startsWith("Bearer ") 
      ? authHeader.split(" ")[1].trim() 
      : authHeader.trim();
    console.log("Token from header:", token ? token.substring(0, 20) + "..." : "Not found");
  }
  
  // If no token in header, check cookies
  if (!token && req.cookies) {
    console.log("Checking cookies:", Object.keys(req.cookies));
    token = req.cookies.token;
    console.log("Token from cookies:", token ? token.substring(0, 20) + "..." : "Not found");
  }
  
  // If no token found anywhere
  if (!token) {
    console.log("No token found in request");
    return res.status(401).json({ success: false, message: "No token, authorization denied" });
  }

  try {
    console.log("Attempting to verify token");
    console.log("JWT_SECRET first 5 chars:", process.env.JWT_SECRET ? process.env.JWT_SECRET.substring(0, 5) + "..." : "Not available");
    
    // For debugging only, log the token hash (not the actual token)
    const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex').substring(0, 10);
    console.log("Token hash (first 10 chars):", tokenHash);
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Token verified successfully");
    console.log("Decoded token:", JSON.stringify(decoded));
    
    // Add user info to request
    req.user = decoded;
    console.log("req.user set to:", JSON.stringify(req.user));
    
    console.log("=== AUTH MIDDLEWARE COMPLETED SUCCESSFULLY ===");
    next();
  } catch (error) {
    console.error("Token verification error:", error.message);
    
    // Check for refresh token if access token is expired
    if (req.cookies && req.cookies.refreshToken) {
      console.log("Access token invalid, trying refresh token");
      try {
        const refreshToken = req.cookies.refreshToken;
        console.log("Refresh token found:", refreshToken ? "Yes" : "No");
        
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        console.log("Refresh token verified");
        
        // Get user data from database
        const user = await User.findById(decoded.userId);
        console.log("User found:", user ? user._id : "No");
        
        if (!user) {
          console.log("User not found in database");
          return res.status(401).json({ success: false, message: "User not found" });
        }
        
        console.log("Creating new access token with user data:", {
          userId: user._id,
          role: user.role
        });
        
        // Generate new access token with all user fields
        const newAccessToken = jwt.sign(
          { 
            userId: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone || "",
            role: user.role
          }, 
          process.env.JWT_SECRET, 
          { expiresIn: "1h" }
        );
        
        console.log("New access token created");
        
        // Set the new token as a cookie
        res.cookie("token", newAccessToken, {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000
        });
        console.log("New access token cookie set");
        
        // Add user info to request
        req.user = { 
          userId: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone || "",
          role: user.role
        };
        console.log("req.user set from refresh token flow:", JSON.stringify(req.user));
        
        console.log("=== AUTH MIDDLEWARE COMPLETED SUCCESSFULLY (REFRESH FLOW) ===");
        next();
      } catch (refreshError) {
        console.error("Refresh token error:", refreshError.message);
        console.log("=== AUTH MIDDLEWARE FAILED (REFRESH FAILURE) ===");
        res.status(401).json({ success: false, message: "Session expired. Please login again." });
      }
    } else {
      console.error("Auth middleware error:", error.message);
      console.log("No refresh token available");
      console.log("=== AUTH MIDDLEWARE FAILED ===");
      res.status(401).json({ success: false, message: "Token is not valid" });
    }
  }
};