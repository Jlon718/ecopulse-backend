
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
  
      const user = await User.findById(userId)
        .select('-password')
        .select('firstName lastName email role lastLogin');
  
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }
  
      res.json({
        success: true,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          lastLogin: user.lastLogin,
          accessToken
        }
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

  exports.updateUserRole = async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
  
      // Validate role
      if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role specified"
        });
      }
  
      // Find and update user
      const user = await User.findByIdAndUpdate(
        userId,
        { role },
        { new: true }
      ).select('-password');
  
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }
  
      res.json({
        success: true,
        message: "User role updated successfully",
        user
      });
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({
        success: false,
        message: "Server Error",
        error: error.message
      });
    }
  };

  exports.updateUserProfile = async (req, res) => {
    try {
      const userId = req.params.id;
      const { firstName, lastName, email, phone } = req.body;
      
      // Prevent email duplication check against other users
      if (email) {
        const existingUser = await User.findOne({ 
          email, 
          _id: { $ne: userId } 
        });
        
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: "Email is already in use by another account"
          });
        }
      }
      
      // Find and update user
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
          ...(email && { email }),
          ...(phone !== undefined && { phone })
        },
        { new: true }
      ).select('-password');
      
      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }
      
      res.json({
        success: true,
        message: "Profile updated successfully",
        user: {
          id: updatedUser._id,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          email: updatedUser.email,
          phone: updatedUser.phone || "",
          role: updatedUser.role
        }
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({
        success: false,
        message: "Server Error",
        error: error.message
      });
    }
  };
  
  // Change password
  exports.changePassword = async (req, res) => {
    try {
      const userId = req.params.id;
      const { currentPassword, newPassword } = req.body;
      
      // Find user with password
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }
      
      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect"
        });
      }
      
      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      // Update password
      user.password = hashedPassword;
      await user.save();
      
      res.json({
        success: true,
        message: "Password updated successfully"
      });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({
        success: false,
        message: "Server Error",
        error: error.message
      });
    }
  };
  
  // Soft delete user
  exports.softDeleteUser = async (req, res) => {
    try {
      const userId = req.params.id;
      
      // First, we need to add isDeleted field to the User model if it doesn't exist
      // In your User model, add: isDeleted: { type: Boolean, default: false }
      
      const user = await User.findByIdAndUpdate(
        userId,
        { 
          isDeleted: true,
          // Optionally anonymize some data
          email: `deleted_${userId}@removed.user`,
          phone: null
        },
        { new: true }
      );
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }
      
      res.json({
        success: true,
        message: "User has been successfully deactivated"
      });
    } catch (error) {
      console.error("Error deactivating user:", error);
      res.status(500).json({
        success: false,
        message: "Server Error",
        error: error.message
      });
    }
  };

// Restore a soft-deleted user
exports.restoreUser = async (req, res) => {
  try {
    const userId = req.params.id;
    
    // We need to bypass the default query filter that excludes deleted users
    // by using findOneAndUpdate with a direct query for the ID
    const user = await User.findOneAndUpdate(
      { _id: userId },
      { isDeleted: false },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    
    res.json({
      success: true,
      message: "User has been successfully restored",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Error restoring user:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

// Get all users including deleted ones (admin only)
exports.getAllUsersWithDeleted = async (req, res) => {
  try {
    // Use a raw find query without the middleware filter
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 });
    
    // Mark which users are deleted in the response
    const formattedUsers = users.map(user => ({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      isDeleted: user.isDeleted || false,
      lastLogin: user.lastLogin
    }));
    
    res.json({
      success: true,
      users: formattedUsers,
      stats: {
        total: users.length,
        active: users.filter(user => !user.isDeleted).length,
        deleted: users.filter(user => user.isDeleted).length
      }
    });
  } catch (error) {
    console.error("Error fetching all users:", error);
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
  