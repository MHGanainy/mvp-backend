import { vi } from 'vitest';

export const mockAccessToken = {
  addGrant: vi.fn(),
  toJwt: vi.fn().mockReturnValue('mock-livekit-token'),
};

export const mockRoomServiceClient = {
  createRoom: vi.fn().mockResolvedValue({ name: 'test-room', sid: 'RM_test123' }),
  deleteRoom: vi.fn().mockResolvedValue({}),
  listRooms: vi.fn().mockResolvedValue([]),
  listParticipants: vi.fn().mockResolvedValue([]),
};

export function createLiveKitMock() {
  return {
    AccessToken: vi.fn().mockImplementation(() => mockAccessToken),
    RoomServiceClient: vi.fn().mockImplementation(() => mockRoomServiceClient),
    VideoGrant: vi.fn(),
  };
}
