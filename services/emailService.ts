import nodemailer from "nodemailer";

interface EmailData {
  to: string;
  subject: string;
  template: string;
  data: any;
}

// Create transporter (configure with your email service)
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

// Email templates
const emailTemplates = {
  "workspace-invitation": (data: any) => ({
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Workspace Invitation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4B2A06; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px 20px; background: #f9f9f9; }
          .button { 
            display: inline-block; 
            background: #4B2A06; 
            color: white; 
            padding: 12px 30px; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0;
          }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          .workspace-info { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Workspace Invitation</h1>
          </div>
          <div class="content">
            <h2>You're invited to join a workspace!</h2>
            <p>Hello,</p>
            <p><strong>${
              data.inviterName
            }</strong> has invited you to join the <strong>${
      data.workspaceName
    }</strong> workspace.</p>
            
            <div class="workspace-info">
              <h3>Workspace Details:</h3>
              <p><strong>Name:</strong> ${data.workspaceName}</p>
              <p><strong>Domain:</strong> ${data.workspaceDomain}</p>
              <p><strong>Your Role:</strong> ${data.invitedRole}</p>
              ${
                data.message
                  ? `<p><strong>Message:</strong> ${data.message}</p>`
                  : ""
              }
            </div>
            
            <p>Click the button below to accept this invitation:</p>
            <button style="text-align: center; margin: 20px 0;" onclick="window.location.href='${data.invitationUrl}'">
              Accept Invitation
            </button>
            
            <p><strong>Important:</strong> This invitation will expire on ${
              data.expiresAt
            }.</p>
            
            <p><strong>What happens next:</strong></p>
            <ul>
              <li>If you already have an account, you'll be logged in and redirected to the workspace</li>
              <li>If you don't have an account, you'll be prompted to create one first</li>
              <li>Once logged in, you'll have access to the workspace and can start collaborating</li>
            </ul>
            
            <p>If you can't click the button, copy and paste this link into your browser:</p>
            <a style="word-break: break-all; color: blue ; background: #f5f5f5; padding: 10px; border-radius: 3px;" href="${data.invitationUrl}">${data.invitationUrl}</a>
          </div>
          <div class="footer">
            <p>This invitation was sent by ${data.inviterName} (${
      data.workspaceDomain
    })</p>
            <p>If you didn't expect this invitation, you can safely ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Workspace Invitation
      
      Hello,
      
      ${data.inviterName} has invited you to join the ${
      data.workspaceName
    } workspace.
      
      Workspace Details:
      - Name: ${data.workspaceName}
      - Domain: ${data.workspaceDomain}
      - Your Role: ${data.invitedRole}
      ${data.message ? `- Message: ${data.message}` : ""}
      
             To accept this invitation, visit: ${data.invitationUrl}
       
       Important: This invitation will expire on ${data.expiresAt}.
       
       What happens next:
       - If you already have an account, you'll be logged in and redirected to the workspace
       - If you don't have an account, you'll be prompted to create one first
       - Once logged in, you'll have access to the workspace and can start collaborating
       
       If you didn't expect this invitation, you can safely ignore this email.
    `,
  }),
  "profile-update-otp": (data: any) => ({
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Profile Update</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4B2A06; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px 20px; background: #f9f9f9; }
          .code { font-size: 28px; letter-spacing: 8px; font-weight: bold; background: #fff; padding: 12px 16px; border-radius: 8px; display: inline-block; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Verify Profile Update</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>Use the OTP code below to verify your profile update. This code will expire in ${data.expiresMinutes || 10} minutes.</p>
            <p class="code">${data.otp}</p>
            <p>If you did not request this change, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${process.env.APP_NAME || "RHP Document"}</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Verify Profile Update\n\nYour OTP is ${data.otp}. It expires in ${data.expiresMinutes || 10} minutes. If you did not request this change, ignore this email.`,
  }),
  "password-change-otp": (data: any) => ({
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Password Change</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4B2A06; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px 20px; background: #f9f9f9; }
          .code { font-size: 28px; letter-spacing: 8px; font-weight: bold; background: #fff; padding: 12px 16px; border-radius: 8px; display: inline-block; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Verify Password Change</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>Use the OTP code below to verify your password change. This code will expire in ${data.expiresMinutes || 10} minutes.</p>
            <p class="code">${data.otp}</p>
            <p>If you did not request this change, please secure your account immediately.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${process.env.APP_NAME || "RHP Document"}</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Verify Password Change\n\nYour OTP is ${data.otp}. It expires in ${data.expiresMinutes || 10} minutes. If you did not request this change, secure your account immediately.`,
  }),
};

export const sendEmail = async (emailData: EmailData): Promise<void> => {
  try {
    const transporter = createTransporter();

    if (!emailTemplates[emailData.template as keyof typeof emailTemplates]) {
      throw new Error(`Email template '${emailData.template}' not found`);
    }

    const template = emailTemplates[
      emailData.template as keyof typeof emailTemplates
    ](emailData.data);

    const mailOptions = {
      from: `"${process.env.APP_NAME || "RHP Document"}" <${
        process.env.SMTP_USER
      }>`,
      to: emailData.to,
      subject: emailData.subject,
      text: template.text,
      html: template.html,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${emailData.to}`);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

export default sendEmail;
