// utils/emailService.js
const nodemailer = require('nodemailer');
require('dotenv').config();

// Configure nodemailer transport
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Existing function for verification emails
const getEmailTemplate = (verificationCode, isGoogleSignIn = false) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2C7A51;">Welcome to EcoPulse!</h2>
      <p>${
        isGoogleSignIn
          ? "You're almost there! To complete your Google sign-in"
          : "Thank you for registering. To complete your registration"
      }, please use the verification code below:</p>
      
      <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
        <strong>${verificationCode}</strong>
      </div>
      
      <p>This verification code will expire in 2 hours.</p>
      
      <p>If you did not ${
        isGoogleSignIn ? 'attempt to sign in with Google' : 'create an account'
      }, you can safely ignore this email.</p>
      
      <p>Thank you,<br>The EcoPulse Team</p>
    </div>
  `;
};

const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// New function to generate the HTML template for password reset email
const getResetEmailTemplate = (resetUrl) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2C7A51;">Reset Your Password</h2>
      <p>We received a request to reset your password. Please click the link below to choose a new password:</p>
      
      <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; text-align: center; font-size: 18px; margin: 20px 0;">
        <a href="${resetUrl}" style="color: #2C7A51; text-decoration: none;">Reset Password</a>
      </div>
      
      <p>This link will expire in 1 hour. If you didn't request a password reset, please ignore this email.</p>
      
      <p>Thank you,<br>The EcoPulse Team</p>
    </div>
  `;
};

// Existing functions for sending verification emails
const sendVerificationEmail = async (user) => {
  try {
    if (!process.env.EMAIL_FROM || !process.env.EMAIL_USER) {
      throw new Error('Email configuration is missing');
    }

    const verificationCode = generateVerificationCode();
    const expirationTime = new Date(Date.now() + 2 * 60 * 60 * 1000);

    user.verificationCode = verificationCode;
    user.verificationCodeExpires = expirationTime;
    await user.save();

    console.log('Attempting to send verification email...');
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'Verify Your Account - EcoPulse',
      html: getEmailTemplate(verificationCode, false)
    });

    console.log('Email sent successfully:', {
      messageId: info.messageId,
      recipient: user.email
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Detailed email error:', {
      error: error.message,
      stack: error.stack,
      code: error.code
    });
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
};

const sendGoogleVerificationEmail = async (user) => {
  try {
    const verificationCode = generateVerificationCode();
    const expirationTime = new Date(Date.now() + 2 * 60 * 60 * 1000);

    user.verificationCode = verificationCode;
    user.verificationCodeExpires = expirationTime;
    await user.save();

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'Complete Your Google Sign-in - EcoPulse',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2C7A51;">Welcome to EcoPulse!</h2>
          <p>You're almost there! To complete your Google sign-in, please use the verification code below:</p>
          
          <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
            <strong>${verificationCode}</strong>
          </div>
          
          <p>This verification code will expire in 2 hours.</p>
          
          <p>If you did not attempt to sign in with Google, you can safely ignore this email.</p>
          
          <p>Thank you,<br>The EcoPulse Team</p>
        </div>
      `
    });

    console.log(`Google verification email sent to ${user.email}`);
    return { success: true };
  } catch (error) {
    console.error('Error sending Google verification email:', error);
    throw error;
  }
};

// New function for sending password reset email
const sendPasswordResetEmail = async (user, token) => {
  try {
    if (!process.env.EMAIL_FROM || !process.env.EMAIL_USER) {
      throw new Error('Email configuration is missing');
    }
    
    // Use environment variable for the frontend URL
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    console.log('Attempting to send password reset email...');
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'Reset Your Password - EcoPulse',
      html: getResetEmailTemplate(resetUrl)
    });

    console.log('Password reset email sent successfully:', {
      messageId: info.messageId,
      recipient: user.email
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
};

// Verify that the email server is ready
transporter.verify(function(error, success) {
  if (error) {
    console.error('Email transport verification failed:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});

module.exports = {
  generateVerificationCode,
  sendVerificationEmail,
  sendGoogleVerificationEmail,
  sendPasswordResetEmail
};
