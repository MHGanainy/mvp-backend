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
   * Check if a Stripe Customer exists and is valid
   * Returns the customer if valid, null if not found or deleted
   */
  async validateCustomer(customerId: string): Promise<Stripe.Customer | null> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      // Check if customer is deleted
      if (customer.deleted) {
        return null;
      }
      return customer as Stripe.Customer;
    } catch (error: any) {
      // Handle "resource_missing" error (customer doesn't exist in this environment)
      if (error.type === 'StripeInvalidRequestError' && error.code === 'resource_missing') {
        return null;
      }
      throw error;
    }
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
