const nodemailer = require('nodemailer');

function isEmailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendQRCodeEmail({ to, attendeeName, eventName, eventDate, eventLocation, qrBuffer, eventSlug }) {
  if (!isEmailConfigured()) {
    throw new Error('EMAIL_NOT_CONFIGURED');
  }

  const transport = createTransport();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const formattedDate = eventDate ? new Date(eventDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }) : 'Date TBD';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: #1e293b; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">You're Registered!</h1>
    <p style="color: #94a3b8; margin: 8px 0 0;">Your QR code is ready</p>
  </div>
  <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
    <p style="font-size: 16px;">Hi <strong>${attendeeName}</strong>,</p>
    <p>You're registered for <strong>${eventName}</strong>. Here are your event details:</p>
    <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e2e8f0;">
      <p style="margin: 0 0 8px;"><strong>📅 Date:</strong> ${formattedDate}</p>
      ${eventLocation ? `<p style="margin: 0;"><strong>📍 Location:</strong> ${eventLocation}</p>` : ''}
    </div>
    <div style="text-align: center; margin: 30px 0;">
      <p style="font-size: 18px; font-weight: bold; margin-bottom: 16px;">Your Check-in QR Code</p>
      <img src="cid:qrcode" alt="QR Code" style="width: 250px; height: 250px; border: 4px solid #e2e8f0; border-radius: 8px;" />
    </div>
    <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px; text-align: center;">
      <p style="margin: 0; font-weight: bold; color: #92400e;">⚠️ Save this QR code — you'll need it to check in at the event!</p>
    </div>
    <p style="color: #64748b; font-size: 14px; margin-top: 20px;">The QR code PNG is also attached to this email for easy saving.</p>
  </div>
</body>
</html>
  `;

  await transport.sendMail({
    from,
    to,
    subject: `Your QR Code for ${eventName}`,
    html,
    attachments: [
      {
        filename: `${eventSlug}-qr.png`,
        content: qrBuffer,
        contentType: 'image/png',
        cid: 'qrcode'
      }
    ]
  });
}

module.exports = { isEmailConfigured, sendQRCodeEmail };
