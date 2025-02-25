const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  // Try to get token from multiple sources
  let token;
  
  // Check Authorization header first
  const authHeader = req.header("Authorization");
  if (authHeader) {
    token = authHeader.startsWith("Bearer ") 
      ? authHeader.split(" ")[1] 
      : authHeader;
  }
  
  // If no token in header, check cookies
  if (!token && req.cookies) {
    token = req.cookies.token;
  }
  
  // If no token found anywhere
  if (!token) {
    return res.status(401).json({ success: false, msg: "No token, authorization denied" });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Add user info to request
    req.user = decoded;
    next();
  } catch (error) {
    // Check for refresh token if access token is expired
    if (req.cookies && req.cookies.refreshToken) {
      try {
        const refreshToken = req.cookies.refreshToken;
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        
        // Generate new access token
        const newAccessToken = jwt.sign({ userId: decoded.userId }, process.env.JWT_SECRET, {
          expiresIn: "1h"
        });
        
        // Set the new token as a cookie
        res.cookie("token", newAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "none",
          maxAge: 7 * 24 * 60 * 60 * 1000
        });
        
        // Add user info to request
        req.user = decoded;
        next();
      } catch (refreshError) {
        console.error("Refresh token error:", refreshError.message);
        res.status(401).json({ success: false, msg: "Session expired. Please login again." });
      }
    } else {
      console.error("Auth middleware error:", error.message);
      res.status(401).json({ success: false, msg: "Token is not valid" });
    }
  }
};