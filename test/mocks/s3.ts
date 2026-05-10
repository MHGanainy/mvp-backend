import { vi } from 'vitest';

const store = new Map<string, Buffer>();

export function getS3Store() {
  return store;
}

export function resetS3() {
  store.clear();
}

export const mockS3Client = {
  send: vi.fn().mockImplementation(async (command: { constructor: { name: string }; input: { Key?: string; Body?: Buffer } }) => {
    const commandName = command.constructor.name;
    if (commandName === 'PutObjectCommand' && command.input.Key && command.input.Body) {
      store.set(command.input.Key, command.input.Body);
    }
    if (commandName === 'GetObjectCommand' && command.input.Key) {
      const data = store.get(command.input.Key);
      return { Body: data };
    }
    return {};
  }),
};

export function createS3Mock() {
  return vi.fn().mockImplementation(() => mockS3Client);
}
