import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email };
}

export async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

export async function sendBookReadyEmail(
  toEmail: string,
  characterName: string,
  downloadUrl: string
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const result = await client.emails.send({
      from: fromEmail || 'Coloring Book Creator <noreply@resend.dev>',
      to: toEmail,
      subject: `${characterName}'s Coloring Story Book is Ready!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Your Coloring Book is Ready!</title>
        </head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #FFF9F0;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%); border-radius: 16px; padding: 40px; text-align: center; color: white;">
              <h1 style="margin: 0 0 10px; font-size: 28px; font-weight: 700;">
                Your Coloring Book is Ready!
              </h1>
              <p style="margin: 0; font-size: 18px; opacity: 0.9;">
                ${characterName}'s personalized story adventure awaits
              </p>
            </div>
            
            <div style="background: white; border-radius: 16px; padding: 40px; margin-top: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
              <p style="font-size: 16px; color: #333; line-height: 1.6; margin: 0 0 20px;">
                Great news! Your personalized 25-page coloring story book featuring <strong>${characterName}</strong> has been created and is ready for download.
              </p>
              
              <p style="font-size: 16px; color: #333; line-height: 1.6; margin: 0 0 30px;">
                Your book includes:
              </p>
              
              <ul style="font-size: 15px; color: #555; line-height: 1.8; margin: 0 0 30px; padding-left: 20px;">
                <li>A beautiful cover page featuring ${characterName}</li>
                <li>5 unique story sections with engaging illustrations</li>
                <li>24 coloring pages in Disney-Pixar style</li>
                <li>High-quality PDF ready for printing</li>
              </ul>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${downloadUrl}" 
                   style="display: inline-block; background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%); color: white; text-decoration: none; padding: 16px 40px; border-radius: 50px; font-size: 18px; font-weight: 600; box-shadow: 0 4px 15px rgba(255, 107, 107, 0.4);">
                  Download Your Coloring Book
                </a>
              </div>
              
              <p style="font-size: 14px; color: #888; text-align: center; margin: 30px 0 0; line-height: 1.6;">
                This download link will be available for 30 days.<br>
                Save your PDF to keep it forever!
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding: 20px;">
              <p style="font-size: 14px; color: #999; margin: 0;">
                Thank you for using our Coloring Book Creator!
              </p>
              <p style="font-size: 12px; color: #bbb; margin: 10px 0 0;">
                Questions? Reply to this email and we'll help you out.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log('Email sent successfully:', result);
    return true;
  } catch (error: any) {
    console.error('Failed to send email:', error);
    return false;
  }
}
