import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3Client = new S3Client({
  region: process.env.AWS_S3_REGION || 'eu-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
})

const BUCKET = process.env.AWS_S3_BUCKET || 'simsbuddy-blog-images'
const CDN_BASE_URL = process.env.CDN_BASE_URL || `https://${BUCKET}.s3.${process.env.AWS_S3_REGION || 'eu-west-2'}.amazonaws.com`

export interface UploadResult {
  url: string
  key: string
}

export async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<UploadResult> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  )
  return {
    url: `${CDN_BASE_URL}/${key}`,
    key,
  }
}

const RECORDINGS_BUCKET = process.env.AWS_S3_RECORDINGS_BUCKET || 'simsbuddy-recordings-dev'
const PRESIGN_TTL = parseInt(process.env.RECORDING_PRESIGN_TTL_SECONDS || '900', 10)

export interface PresignedDownload {
  url: string
  expiresAt: Date
}

export async function presignRecordingDownload(key: string): Promise<PresignedDownload> {
  const command = new GetObjectCommand({ Bucket: RECORDINGS_BUCKET, Key: key })
  const url = await getSignedUrl(s3Client, command, { expiresIn: PRESIGN_TTL })
  return { url, expiresAt: new Date(Date.now() + PRESIGN_TTL * 1000) }
}

export { s3Client, BUCKET, CDN_BASE_URL, RECORDINGS_BUCKET }
