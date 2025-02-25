
const User = require("../models/User");


exports.getAllUsers = async (req, res) => {
    try {
      const users = await User.find()
        .select('-password')
        .sort({ createdAt: -1 });
  
      const usersWithStats = {
        users,
        stats: {
          total: users.length,
          active: users.filter(user => user.lastLogin).length,
          inactive: users.filter(user => !user.lastLogin).length,
          newUsers: users.filter(user => {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            return new Date(user.createdAt) > thirtyDaysAgo;
          }).length
        }
      };
  
      res.json({
        success: true,
        ...usersWithStats
      });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error fetching users' 
      });
    }
  };
  // Fix 3: Separate getUserById into its own export
  exports.getUserById = async (req, res) => {
    try {
      const userId = req.params.id;
  
      const user = await User.findById(userId).select('-password');
  
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }
  
      // Fix 4: Check if req.user exists and fix comparison operator
      if (!req.user || (req.user.role !== 'admin' && req.user.userId !== userId)) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized. You can only access your own information"
        });
      }
  
      res.json({
        success: true,
        user
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({
        success: false,
        message: "Server Error",
        error: error.message
      });
    }
  };


  //authnticated getalluser
//   exports.getAllUsers = async (req, res) => {
//     try {
//       // Fix 2: Check if req.user exists
//       if (!req.user || req.user.role !== 'admin') {
//         return res.status(403).json({
//           success: false,
//           message: "Unauthorized. Admin access required"
//         });
//       }
  
//       const users = await User.find().select('-password');
  
//       res.json({
//         success: true,
//         count: users.length,
//         users
//       });
//     } catch (error) {
//       console.error("error fetching users:", error);
//       res.status(500).json({
//         success: false,
//         message: "Server Error",
//         error: error.message
//       });
//     }
//   };
  