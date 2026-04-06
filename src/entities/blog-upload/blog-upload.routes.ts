import { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import crypto from 'crypto'
import { uploadToS3 } from '../../shared/s3'
import { authenticate, isAdmin } from '../../middleware/auth.middleware'
import { replyInternalError } from '../../shared/route-error'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const SIZES = [
  { name: 'featured', width: 1200, height: 630 },
  { name: 'content', width: 800, height: 600 },
  { name: 'thumbnail', width: 400, height: 300 },
] as const

export default async function blogUploadRoutes(fastify: FastifyInstance) {

  // POST /blog/upload (admin, rate-limited)
  fastify.post(
    '/blog/upload',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      try {
        if (!isAdmin(request)) {
          return reply.status(403).send({ error: 'Admin access required' })
        }

        const file = await request.file()
        if (!file) {
          return reply.status(400).send({ error: 'No file uploaded' })
        }

        if (!ALLOWED_TYPES.includes(file.mimetype)) {
          return reply.status(400).send({
            error: 'Invalid file type. Allowed: JPEG, PNG, WebP',
          })
        }

        const buffer = await file.toBuffer()
        const hash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 8)
        const date = new Date()
        const prefix = `blog/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`

        // Process all sizes in parallel
        const results: Record<string, string> = {}

        await Promise.all(
          SIZES.map(async (size) => {
            const processed = await sharp(buffer)
              .resize(size.width, size.height, { fit: 'cover' })
              .webp({ quality: 80 })
              .toBuffer()

            const key = `${prefix}/${hash}-${size.width}x${size.height}.webp`
            const { url } = await uploadToS3(processed, key, 'image/webp')
            results[size.name] = url
          })
        )

        // Generate blur placeholder
        const tiny = await sharp(buffer)
          .resize(10, 10, { fit: 'inside' })
          .jpeg({ quality: 30 })
          .toBuffer()
        const blurDataUrl = `data:image/jpeg;base64,${tiny.toString('base64')}`

        reply.header('Cache-Control', 'no-store').send({
          featured: results.featured,
          content: results.content,
          thumbnail: results.thumbnail,
          blurDataUrl,
          width: 1200,
          height: 630,
        })
      } catch (error) {
        replyInternalError(request, reply, error, 'Failed to upload image')
      }
    }
  )
}
