import { vi } from 'vitest';

let cannedResponse = 'Mock AI feedback response.';

export function setOpenAIResponse(text: string) {
  cannedResponse = text;
}

export const mockOpenAIChat = {
  completions: {
    create: vi.fn().mockImplementation(async () => ({
      choices: [{ message: { content: cannedResponse } }],
    })),
  },
};

export function createOpenAIMock() {
  return vi.fn().mockImplementation(() => ({ chat: mockOpenAIChat }));
}

export function createGroqMock() {
  return vi.fn().mockImplementation(() => ({ chat: mockOpenAIChat }));
}
