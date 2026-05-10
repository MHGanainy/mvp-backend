import { vi } from 'vitest';

export const mockStripe = {
  customers: {
    create: vi.fn().mockResolvedValue({ id: 'cus_test123' }),
    retrieve: vi.fn().mockResolvedValue({ id: 'cus_test123' }),
  },
  checkout: {
    sessions: {
      create: vi.fn().mockResolvedValue({ id: 'cs_test123', url: 'https://checkout.stripe.com/test' }),
      retrieve: vi.fn().mockResolvedValue({ id: 'cs_test123', payment_status: 'paid' }),
    },
  },
  paymentIntents: {
    create: vi.fn().mockResolvedValue({ id: 'pi_test123', client_secret: 'pi_test123_secret' }),
  },
  webhooks: {
    constructEvent: vi.fn(),
  },
  subscriptions: {
    create: vi.fn().mockResolvedValue({ id: 'sub_test123', status: 'active' }),
    cancel: vi.fn().mockResolvedValue({ id: 'sub_test123', status: 'canceled' }),
  },
};

export function createStripeMock() {
  return vi.fn().mockImplementation(() => mockStripe);
}
