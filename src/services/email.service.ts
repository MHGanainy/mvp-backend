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
            .header { background-color: #003180; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; }
            .otp-code { font-size: 32px; font-weight: bold; color: #3b82f6; text-align: center; letter-spacing: 5px; padding: 20px; background-color: white; border-radius: 5px; margin: 20px 0; }
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
            .header { background-color: #003180; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; }
            .button { display: inline-block; padding: 12px 30px; background-color: #003180; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
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
              <p style="word-break: break-all; color: #3b82f6;">${resetUrl}</p>
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
            .header { background-color: #003180; color: white; padding: 20px; text-align: center; }
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

  async sendWelcomeEmail(
    email: string,
    name?: string,
    freeCredits?: number
  ): Promise<void> {
    const creditsSection =
      freeCredits && freeCredits > 0
        ? `
              <div style="background-color: #dbeafe; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                <h2 style="margin-top: 0; color: #003180;">🎁 Free Credits on Us!</h2>
                <p style="font-size: 18px; margin: 10px 0;">
                  <strong>We're giving you <span style="color: #3b82f6; font-size: 24px;">${freeCredits} free credits</span> to try out our product!</strong>
                </p>
                <p>These credits are already in your account and ready to use. Start exploring our platform and experience all the amazing features we have to offer.</p>
              </div>
            `
        : "";

    const creditsText =
      freeCredits && freeCredits > 0
        ? `\n\n🎁 Great news! We're giving you ${freeCredits} free credits to try out our product! These credits are already in your account and ready to use.`
        : "";

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
            .header { background-color: #003180; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; }
            .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
            .cta-button { display: inline-block; padding: 12px 30px; background-color: #003180; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
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
              ${creditsSection}
              <p>You can now enjoy all the features of our platform.</p>
              <div style="text-align: center; margin-top: 30px;">
                <a href="${
                  process.env.FRONTEND_URL || "http://localhost:5173"
                }" style="display: inline-block; padding: 12px 30px; background-color: #003180; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
                  Get Started
                </a>
              </div>
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
      }!\n\nYour email has been successfully verified and your account is now active.${creditsText}\n\nYou can now enjoy all the features of our platform.\n\nVisit: ${
        process.env.FRONTEND_URL || "http://localhost:5173"
      }`,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendCreditPurchaseConfirmation(
    email: string,
    name: string,
    credits: number,
    amountInPence: number,
    packageName: string
  ): Promise<void> {
    const amountInPounds = (amountInPence / 100).toFixed(2);

    const mailOptions = {
      from: `"${process.env.APP_NAME || "Your App"}" <${
        process.env.SMTP_USER
      }>`,
      to: email,
      subject: `Payment Successful - ${credits} Credits Added`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #003180; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; }
            .receipt { background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .receipt-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
            .receipt-row:last-child { border-bottom: none; font-weight: bold; }
            .credits-badge { background-color: #003180; color: white; padding: 15px 30px; border-radius: 5px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Payment Successful!</h1>
            </div>
            <div class="content">
              <p>Hi ${name},</p>
              <p>Thank you for your purchase! Your payment has been processed successfully.</p>

              <div class="credits-badge">
                +${credits} Credits Added
              </div>

              <div class="receipt">
                <h3 style="margin-top: 0;">Receipt</h3>
                <div class="receipt-row">
                  <span>Package:</span>
                  <span><strong>${packageName}</strong></span>
                </div>
                <div class="receipt-row">
                  <span>Credits:</span>
                  <span><strong>${credits}</strong></span>
                </div>
                <div class="receipt-row">
                  <span>Amount Paid:</span>
                  <span><strong>£${amountInPounds} GBP</strong></span>
                </div>
              </div>

              <p>Your credits have been added to your account and are ready to use immediately.</p>
              <p>Start using them now to practice with voice simulations!</p>

              <p style="margin-top: 30px;">
                <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}"
                   style="background-color: #003180; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                  Go to Dashboard
                </a>
              </p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply.</p>
              <p>Need help? Contact our support team.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${name},\n\nThank you for your purchase! Your payment has been processed successfully.\n\n${credits} credits have been added to your account.\n\nReceipt:\nPackage: ${packageName}\nCredits: ${credits}\nAmount Paid: £${amountInPounds} GBP\n\nYour credits are ready to use immediately. Start using them now to practice with voice simulations!\n\nVisit: ${
        process.env.FRONTEND_URL || "http://localhost:5173"
      }`,
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
