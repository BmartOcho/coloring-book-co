// Resend email integration
import { Resend } from "resend";

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("X_REPLIT_TOKEN not found for repl/depl");
  }

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
    {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    }
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  if (!connectionSettings || !connectionSettings.settings.api_key) {
    throw new Error("Resend not connected");
  }
  return {
    apiKey: connectionSettings.settings.api_key,
    fromEmail: connectionSettings.settings.from_email,
  };
}

export async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail,
  };
}

export async function sendOrderConfirmationEmail(
  toEmail: string,
  orderId: number,
  progressUrl: string
): Promise<void> {
  try {
    const { client, fromEmail } = await getResendClient();

    await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: "Your Coloring Book is Being Created!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2C3E50;">Thank You for Your Order!</h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            We're creating your personalized 25-page coloring book. This process takes a few minutes as we generate each unique page based on your uploaded image.
          </p>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            <strong>Order ID:</strong> #${orderId}
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${progressUrl}" style="background-color: #95E1D3; color: #2C3E50; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              View Your Progress
            </a>
          </div>
          <p style="color: #555; font-size: 14px; line-height: 1.6;">
            You can check the progress of your coloring book at any time by clicking the button above.
          </p>
          <p style="color: #888; font-size: 12px; margin-top: 30px;">
            Photo to Coloring Book - Transform your photos into beautiful coloring pages
          </p>
        </div>
      `,
    });
    console.log(`Order confirmation email sent to ${toEmail}`);
  } catch (error) {
    console.error("Failed to send email:", error);
    throw error;
  }
}
