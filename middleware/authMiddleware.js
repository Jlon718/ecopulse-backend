const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  // Get token from header
  const authHeader = req.header("Authorization");
  
  // Check if no auth header
  if (!authHeader) {
    return res.status(401).json({ success: false, msg: "No token, authorization denied" });
  }

  // Format is typically "Bearer [token]"
  const token = authHeader.startsWith("Bearer ") 
    ? authHeader.split(" ")[1] 
    : authHeader;
  
  if (!token) {
    return res.status(401).json({ success: false, msg: "No token, authorization denied" });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Add user info to request
    req.user = decoded.userId;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    res.status(401).json({ success: false, msg: "Token is not valid" });
  }
};