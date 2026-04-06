import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

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

export { s3Client, BUCKET, CDN_BASE_URL }
