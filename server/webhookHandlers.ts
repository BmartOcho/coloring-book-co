import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';
import { startBookGeneration } from './bookGenerator';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string, uuid: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    
    const stripeClient = await getUncachableStripeClient();
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (endpointSecret) {
      try {
        const event = stripeClient.webhooks.constructEvent(
          payload,
          signature,
          endpointSecret
        );
        
        if (event.type === 'checkout.session.completed') {
          await this.handleCheckoutSessionCompleted(event.data.object);
        }
      } catch (err) {
        console.log('Webhook signature verification failed, processing via sync only');
      }
    }
    
    await sync.processWebhook(payload, signature, uuid);
  }
  
  static async handleCheckoutSessionCompleted(session: any): Promise<void> {
    console.log(`[webhook] Processing checkout session completed: ${session.id}`);
    
    const orderId = session.metadata?.orderId;
    if (!orderId) {
      console.log('[webhook] No orderId in session metadata, skipping');
      return;
    }
    
    const order = await storage.getOrder(orderId);
    if (!order) {
      console.log(`[webhook] Order ${orderId} not found`);
      return;
    }
    
    if (order.status === 'paid' || order.status === 'generating' || order.status === 'completed') {
      console.log(`[webhook] Order ${orderId} already processed (status: ${order.status})`);
      return;
    }
    
    await storage.updateOrder(orderId, {
      status: 'paid',
      amountPaid: session.amount_total,
      stripePaymentIntentId: session.payment_intent,
    });
    
    console.log(`[webhook] Order ${orderId} marked as paid, starting book generation`);
    
    startBookGeneration(orderId).catch((err: unknown) => {
      console.error(`[webhook] Failed to start book generation for order ${orderId}:`, err);
    });
  }
}
