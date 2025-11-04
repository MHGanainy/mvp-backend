// src/services/stripe.service.ts
import Stripe from 'stripe';

export class StripeService {
  private stripe: Stripe;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined in environment variables');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-10-29.clover',
      typescript: true,
    });
  }

  /**
   * Create a Stripe Checkout Session
   */
  async createCheckoutSession(params: Stripe.Checkout.SessionCreateParams): Promise<Stripe.Checkout.Session> {
    return await this.stripe.checkout.sessions.create(params);
  }

  /**
   * Create a Stripe Customer
   */
  async createCustomer(params: Stripe.CustomerCreateParams): Promise<Stripe.Customer> {
    return await this.stripe.customers.create(params);
  }

  /**
   * Retrieve a Stripe Customer
   */
  async getCustomer(customerId: string): Promise<Stripe.Customer> {
    return await this.stripe.customers.retrieve(customerId) as Stripe.Customer;
  }

  /**
   * Retrieve a Checkout Session
   */
  async getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return await this.stripe.checkout.sessions.retrieve(sessionId);
  }

  /**
   * Construct webhook event from raw body and signature
   * This verifies the webhook signature for security
   */
  constructWebhookEvent(
    payload: string | Buffer,
    signature: string,
    webhookSecret: string
  ): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }
}
