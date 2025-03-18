// controllers/uploadController.js
const { cloudinary } = require('../utils/cloudinary');
const User = require('../models/User');

// Upload avatar directly from frontend (for mobile/React Native)
// In uploadController.js
exports.uploadAvatar = async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded"
        });
      }
  
      // Get the Cloudinary URL from the uploaded file
      // This depends on how your Cloudinary middleware is set up
      const avatarUrl = req.file.path; // Could also be req.file.secure_url depending on your setup
      
      console.log('Upload avatar debug:', {
        userId: req.user.id || req.user.userId, // Check both formats
        fileInfo: req.file,
        avatarUrl: avatarUrl
      });
  
      // Make sure we have a valid URL before updating
      if (!avatarUrl) {
        return res.status(400).json({
          success: false,
          message: "No valid avatar URL generated"
        });
      }
  
      // Get the user ID from the request
      const userId = req.user.id || req.user.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User ID not found in request"
        });
      }
  
      // Update user with new avatar URL
      const updatedUser = await User.findByIdAndUpdate(
        userId, 
        { 
          avatar: avatarUrl,
          lastActivity: new Date()
        },
        { new: true }
      ).select('-password');
  
      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }
  
      // Send back the updated user with the avatar URL
      res.status(200).json({
        success: true,
        message: "Avatar uploaded successfully",
        avatar: avatarUrl, // Include this specifically
        user: {
          id: updatedUser._id,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          email: updatedUser.email,
          avatar: updatedUser.avatar, // Make sure this contains the URL
          gender: updatedUser.gender,
          role: updatedUser.role
        }
      });
    } catch (error) {
      console.error("Error uploading avatar:", error);
      res.status(500).json({
        success: false,
        message: "Error uploading avatar",
        error: error.message
      });
    }
  };

// Direct upload from base64 string (for web)
exports.uploadBase64Avatar = async (req, res) => {
    try {
      const { base64Image, avatarId, uniqueId } = req.body;
      
      if (!base64Image) {
        return res.status(400).json({
          success: false,
          message: "No image data provided"
        });
      }
      
      // Get user ID from authenticated request
      const userId = req.user.id || req.user.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User ID not found in request"
        });
      }
      
      // Create a unique identifier for Cloudinary
      const publicId = avatarId && uniqueId 
        ? `ecopulse_avatars/user_${userId}_${avatarId}_${uniqueId}` 
        : `ecopulse_avatars/user_${userId}_${Date.now()}`;
      
      console.log('Uploading base64 avatar to Cloudinary with ID:', publicId);
      
      // Upload to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(base64Image, {
        public_id: publicId,
        overwrite: true,
        folder: 'ecopulse_avatars'
      });
      
      // Update user with new avatar URL
      const updatedUser = await User.findByIdAndUpdate(
        userId, 
        { 
          avatar: uploadResult.secure_url,
          lastActivity: new Date()
        },
        { new: true }
      ).select('-password');
      
      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }
      
      // Return success response
      res.status(200).json({
        success: true,
        message: "Avatar uploaded successfully",
        avatar: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        user: {
          id: updatedUser._id,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          email: updatedUser.email,
          avatar: updatedUser.avatar,
          gender: updatedUser.gender,
          role: updatedUser.role
        }
      });
    } catch (error) {
      console.error("Error uploading base64 avatar:", error);
      res.status(500).json({
        success: false,
        message: "Error uploading avatar",
        error: error.message
      });
    }
  };

  exports.uploadDefaultAvatar = async (req, res) => {
    try {
      const { avatarBase64, avatarId, uniqueId, transformation } = req.body;
      
      if (!avatarBase64 || !avatarId) {
        return res.status(400).json({
          success: false,
          message: "Avatar data and ID are required"
        });
      }
      
      const userId = req.user.id || req.user.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User ID not found in request"
        });
      }
      
      const publicId = `ecopulse_avatars/user_${userId}_default-avatar_${uniqueId}`;
      
      // Upload to Cloudinary with proper image handling
      const uploadResult = await cloudinary.uploader.upload(avatarBase64, {
        public_id: publicId,
        overwrite: true,
        resource_type: 'image',
        folder: 'ecopulse_avatars',
        transformation: transformation || {
          width: 400,
          height: 400,
          crop: 'fill',
          quality: 'auto',
          format: 'webp'
        }
      });
      
      // Update user with new avatar URL
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { 
          avatar: uploadResult.secure_url,
          lastActivity: new Date()
        },
        { new: true }
      ).select('-password');
      
      res.status(200).json({
        success: true,
        message: "Default avatar uploaded successfully",
        avatarUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        user: updatedUser
      });
    } catch (error) {
      console.error("Error uploading default avatar:", error);
      res.status(500).json({
        success: false,
        message: "Error uploading avatar",
        error: error.message
      });
    }
  };