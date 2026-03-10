const nodemailer = require('nodemailer');

// Create email transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetToken, resetUrl) => {
  const transporter = createTransporter();
  const mailOptions = {
    from: `"AdPartnr" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Password Reset Request',
    html: generateResetEmailTemplate(resetUrl, resetToken)
  };
  return await transporter.sendMail(mailOptions);
};

// Generate password reset email template
const generateResetEmailTemplate = (resetUrl, resetToken) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 0; }
        .header { background-color: #6633FF; color: #ffffff; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; font-weight: bold; color: #ffffff; }
        .content { padding: 30px 20px; background-color: #ffffff; }
        .button { display: inline-block; padding: 14px 40px; background-color: #6633FF; color: #ffffff !important; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; font-size: 16px; }
        .button:hover { background-color: #5522EE; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; background-color: #f9f9f9; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>You requested to reset your password for your AdPartnr account. Click the button below to reset your password:</p>
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button" style="color: #ffffff !important; text-decoration: none;">Reset Password</a>
          </div>
          <p>This link will expire in 1 hour for security reasons.</p>
          <p>If you didn't request this password reset, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} AdPartnr. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

module.exports = {
  sendPasswordResetEmail
};

