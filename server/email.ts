import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOrderConfirmationEmail(
  toEmail: string,
  orderId: number,
  progressUrl: string
): Promise<void> {
  try {
    await resend.emails.send({
      from: "Photo to Coloring Book <onboarding@resend.dev>",
      to: toEmail,
      subject: "Your Coloring Book is Being Created!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2C3E50;">Thank You for Your Order!</h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            We're creating your personalized 30-page coloring book. This process takes a few minutes as we generate each unique page based on your uploaded image.
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

export async function sendCompletionEmail(
  toEmail: string,
  orderId: number,
  progressUrl: string
): Promise<void> {
  try {
    await resend.emails.send({
      from: "Photo to Coloring Book <onboarding@resend.dev>",
      to: toEmail,
      subject: "Your Coloring Book is Ready!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2C3E50;">Your Coloring Book is Complete!</h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Great news! Your personalized 30-page coloring book has been generated and is ready for download.
          </p>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            <strong>Order ID:</strong> #${orderId}
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${progressUrl}" style="background-color: #95E1D3; color: #2C3E50; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Download Your Coloring Book
            </a>
          </div>
          <p style="color: #888; font-size: 12px; margin-top: 30px;">
            Photo to Coloring Book - Transform your photos into beautiful coloring pages
          </p>
        </div>
      `,
    });
    console.log(`Completion email sent to ${toEmail}`);
  } catch (error) {
    console.error("Failed to send completion email:", error);
    throw error;
  }
}
