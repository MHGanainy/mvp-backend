import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned?X-Amz-Expires=900'),
}))

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    send = vi.fn()
  }
  class PutObjectCommand {
    input: unknown
    constructor(input: unknown) { this.input = input }
  }
  class GetObjectCommand {
    input: unknown
    constructor(input: unknown) { this.input = input }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand }
})

import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { presignRecordingDownload } from './s3'

describe('presignRecordingDownload', () => {
  beforeEach(() => {
    vi.mocked(getSignedUrl).mockResolvedValue('https://s3.example.com/presigned?X-Amz-Expires=900')
  })

  it('returns a url and expiresAt for a given key', async () => {
    const result = await presignRecordingDownload('simulation-recordings/case/abc123.ogg')
    expect(result.url).toBe('https://s3.example.com/presigned?X-Amz-Expires=900')
    expect(result.expiresAt).toBeInstanceOf(Date)
  })

  it('expiresAt is approximately 15 minutes in the future', async () => {
    const before = Date.now()
    const result = await presignRecordingDownload('simulation-recordings/case/abc123.ogg')
    const after = Date.now()
    const ttl = result.expiresAt.getTime() - before
    expect(ttl).toBeGreaterThanOrEqual(900 * 1000 - 100)
    expect(ttl).toBeLessThanOrEqual(900 * 1000 + (after - before) + 100)
  })

  it('calls getSignedUrl with a GetObjectCommand', async () => {
    await presignRecordingDownload('simulation-recordings/interview/xyz.ogg')
    expect(getSignedUrl).toHaveBeenCalledOnce()
    const [, command] = vi.mocked(getSignedUrl).mock.calls[0]
    expect((command as any).input.Key).toBe('simulation-recordings/interview/xyz.ogg')
  })
})
