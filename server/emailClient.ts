import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  console.log('[email] Fetching Resend credentials...');
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  console.log(`[email] Connectors hostname: ${hostname}`);
  
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    console.error('[email] X_REPLIT_TOKEN not found - neither REPL_IDENTITY nor WEB_REPL_RENEWAL set');
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }
  console.log('[email] Token type:', xReplitToken.startsWith('repl ') ? 'REPL_IDENTITY' : 'WEB_REPL_RENEWAL');

  const url = 'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend';
  console.log(`[email] Fetching from: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });
  
  console.log(`[email] Connection API response status: ${response.status}`);
  const data = await response.json();
  console.log(`[email] Connection API response items count: ${data.items?.length || 0}`);
  
  connectionSettings = data.items?.[0];

  if (!connectionSettings) {
    console.error('[email] No Resend connection found in response');
    throw new Error('Resend not connected');
  }
  
  if (!connectionSettings.settings?.api_key) {
    console.error('[email] Resend connection found but no API key');
    throw new Error('Resend API key not configured');
  }
  
  const fromEmail = connectionSettings.settings.from_email;
  console.log(`[email] Credentials obtained. From email: ${fromEmail || 'NOT SET'}`);
  
  if (!fromEmail) {
    console.warn('[email] WARNING: from_email is not set in Resend connection - using fallback');
  }
  
  return { apiKey: connectionSettings.settings.api_key, fromEmail };
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
  console.log(`[email] Attempting to send book ready email to: ${toEmail}`);
  console.log(`[email] Download URL: ${downloadUrl}`);
  
  try {
    console.log('[email] Getting Resend client...');
    const { client, fromEmail } = await getUncachableResendClient();
    console.log(`[email] Using from email: ${fromEmail}`);
    
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

    console.log('[email] Email sent successfully:', JSON.stringify(result, null, 2));
    return true;
  } catch (error: any) {
    console.error('[email] Failed to send email:', error.message || error);
    if (error.statusCode) {
      console.error('[email] Status code:', error.statusCode);
    }
    if (error.name) {
      console.error('[email] Error name:', error.name);
    }
    // Log full error for debugging
    console.error('[email] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    return false;
  }
}
