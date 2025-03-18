// controllers/adminController.js
const User = require('../models/User');
const ActivityLog = require('../models/Activity');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');

// Get dashboard summary for admin
exports.getDashboardSummary = async (req, res) => {
  try {
    // Verify admin role (you should have middleware for this as well)
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    // Get counts from various collections
    const totalUsers = await User.countDocuments();
    const deactivatedAccounts = await User.countDocuments({ isDeleted: true });
    const recoveredUsers = await ActivityLog.countDocuments({ 
      type: 'account_reactivated', 
      status: 'completed' 
    });

    // Get today's activities
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayActivities = await ActivityLog.countDocuments({
      timestamp: { $gte: today }
    });

    // Get this week's deactivations and recoveries
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const weeklyDeactivations = await ActivityLog.countDocuments({
      type: 'account_deactivated',
      status: 'completed',
      timestamp: { $gte: oneWeekAgo }
    });
    
    const weeklyRecoveries = await ActivityLog.countDocuments({
      type: 'account_reactivated',
      status: 'completed',
      timestamp: { $gte: oneWeekAgo }
    });

    // Get pending recovery requests
    const pendingRecoveries = await User.countDocuments({
      isDeleted: true,
      recoveryToken: { $ne: null },
      recoveryTokenExpires: { $gt: new Date() }
    });

    // Return dashboard summary
    res.json({
      success: true,
      data: {
        totalUsers,
        deactivatedAccounts,
        recoveredAccounts: recoveredUsers,
        todayActivities,
        weeklyDeactivations,
        weeklyRecoveries,
        pendingRecoveries
      }
    });
  } catch (error) {
    console.error('Error getting dashboard summary:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get account activities
exports.getAccountActivities = async (req, res) => {
  try {
    // Verify admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get activities with user details
    const activities = await ActivityLog.find()
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const total = await ActivityLog.countDocuments();

    res.json({
      success: true,
      data: {
        activities,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit
        }
      }
    });
  } catch (error) {
    console.error('Error getting account activities:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Mark activity as read
exports.markActivityAsRead = async (req, res) => {
  try {
    const { activityId } = req.params;

    // Verify admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    // Validate activity ID
    if (!mongoose.Types.ObjectId.isValid(activityId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid activity ID'
      });
    }

    // Update activity
    const result = await ActivityLog.findByIdAndUpdate(
      activityId,
      { read: true },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }

    res.json({
      success: true,
      message: 'Activity marked as read',
      data: result
    });
  } catch (error) {
    console.error('Error marking activity as read:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Mark all activities as read
exports.markAllActivitiesAsRead = async (req, res) => {
  try {
    // Verify admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    // Update all unread activities
    const result = await ActivityLog.updateMany(
      { read: false },
      { read: true }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} activities marked as read`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error marking all activities as read:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get admin notifications
exports.getNotifications = async (req, res) => {
  try {
    // Verify admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get notifications
    const notifications = await Notification.find({ recipient: req.user.userId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const total = await Notification.countDocuments({ recipient: req.user.userId });

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit
        }
      }
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Mark notification as read
exports.markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    // Verify ownership or admin role
    const notification = await Notification.findById(notificationId);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    if (notification.recipient.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Update notification
    notification.read = true;
    await notification.save();

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Mark all notifications as read
exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    // Verify admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    // Update all unread notifications for this user
    const result = await Notification.updateMany(
      { recipient: req.user.userId, read: false },
      { read: true }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get detailed account activity report (for export)
exports.getActivityReport = async (req, res) => {
  try {
    // Verify admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    // Get filter parameters
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    const activityType = req.query.type;
    const status = req.query.status;

    // Build filter
    const filter = {};
    
    if (startDate && endDate) {
      filter.timestamp = { $gte: startDate, $lte: endDate };
    } else if (startDate) {
      filter.timestamp = { $gte: startDate };
    } else if (endDate) {
      filter.timestamp = { $lte: endDate };
    }
    
    if (activityType) {
      filter.type = activityType;
    }
    
    if (status) {
      filter.status = status;
    }

    // Get activities
    const activities = await ActivityLog.find(filter)
      .sort({ timestamp: -1 });

    // Get user details if needed
    const activitiesWithUserDetails = await Promise.all(
      activities.map(async (activity) => {
        if (activity.userId) {
          const user = await User.findById(activity.userId).select('firstName lastName email');
          return {
            ...activity.toObject(),
            userDetails: user ? {
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email
            } : null
          };
        }
        return activity.toObject();
      })
    );

    res.json({
      success: true,
      data: {
        activities: activitiesWithUserDetails,
        count: activitiesWithUserDetails.length,
        filters: {
          startDate,
          endDate,
          activityType,
          status
        }
      }
    });
  } catch (error) {
    console.error('Error getting activity report:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};