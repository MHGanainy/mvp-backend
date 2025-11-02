// src/services/email.service.ts
import nodemailer from "nodemailer";

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Configure email transporter
    // In production, use environment variables for these settings
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "", // App password for Gmail
      },
    });
  }

  async sendOTPEmail(email: string, otp: string, name?: string): Promise<void> {
    const mailOptions = {
      from: `"${process.env.APP_NAME || "Your App"}" <${
        process.env.SMTP_USER
      }>`,
      to: email,
      subject: "Verify Your Email - OTP Code",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; }
            .otp-code { font-size: 32px; font-weight: bold; color: #4CAF50; text-align: center; letter-spacing: 5px; padding: 20px; background-color: white; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Email Verification</h1>
            </div>
            <div class="content">
              <p>Hi ${name || "there"},</p>
              <p>Thank you for registering! Please use the following OTP code to verify your email address:</p>
              <div class="otp-code">${otp}</div>
              <p>This code will expire in <strong>10 minutes</strong>.</p>
              <p>If you didn't request this code, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${
        name || "there"
      },\n\nThank you for registering! Your OTP code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    name?: string
  ): Promise<void> {
    const resetUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"${process.env.APP_NAME || "Your App"}" <${
        process.env.SMTP_USER
      }>`,
      to: email,
      subject: "Password Reset Request",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; }
            .button { display: inline-block; padding: 12px 30px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
            .warning { background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset</h1>
            </div>
            <div class="content">
              <p>Hi ${name || "there"},</p>
              <p>We received a request to reset your password. Click the button below to reset it:</p>
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #2196F3;">${resetUrl}</p>
              <div class="warning">
                <strong>⚠️ Important:</strong> This link will expire in <strong>1 hour</strong>.
              </div>
              <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${
        name || "there"
      },\n\nWe received a request to reset your password. Click the link below to reset it:\n\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request a password reset, please ignore this email.`,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendPasswordChangedEmail(email: string, name?: string): Promise<void> {
    const mailOptions = {
      from: `"${process.env.APP_NAME || "Your App"}" <${
        process.env.SMTP_USER
      }>`,
      to: email,
      subject: "Password Changed Successfully",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; }
            .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
            .warning { background-color: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Changed</h1>
            </div>
            <div class="content">
              <p>Hi ${name || "there"},</p>
              <p>This is to confirm that your password has been successfully changed.</p>
              <div class="warning">
                <strong>⚠️ Security Notice:</strong> If you did not make this change, please contact our support team immediately.
              </div>
              <p>You can now log in with your new password.</p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${
        name || "there"
      },\n\nThis is to confirm that your password has been successfully changed.\n\nIf you did not make this change, please contact our support team immediately.\n\nYou can now log in with your new password.`,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendWelcomeEmail(email: string, name?: string): Promise<void> {
    const mailOptions = {
      from: `"${process.env.APP_NAME || "Your App"}" <${
        process.env.SMTP_USER
      }>`,
      to: email,
      subject: "Welcome! Your Email is Verified",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; }
            .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome!</h1>
            </div>
            <div class="content">
              <p>Hi ${name || "there"},</p>
              <p>Welcome to ${process.env.APP_NAME || "our platform"}! 🎉</p>
              <p>Your email has been successfully verified and your account is now active.</p>
              <p>You can now enjoy all the features of our platform.</p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${name || "there"},\n\nWelcome to ${
        process.env.APP_NAME || "our platform"
      }!\n\nYour email has been successfully verified and your account is now active.\n\nYou can now enjoy all the features of our platform.`,
    };

    await this.transporter.sendMail(mailOptions);
  }

  // Test email configuration
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error("Email service connection failed:", error);
      return false;
    }
  }
}

// Singleton instance
export const emailService = new EmailService();
