import Fastify from 'fastify'
import { PrismaClient } from '@prisma/client'

const fastify = Fastify({ logger: true })
const prisma = new PrismaClient()

// Health check
fastify.get('/health', async () => {
  return { status: 'OK', timestamp: new Date().toISOString() }
})

// Get all users
fastify.get('/users', async () => {
  const users = await prisma.user.findMany({
    include: { posts: true }
  })
  return users
})

// Create user
fastify.post('/users', async (request) => {
  const { email, name } = request.body as { email: string; name?: string }
  
  const user = await prisma.user.create({
    data: { email, name }
  })
  return user
})

// Get user by ID
fastify.get('/users/:id', async (request) => {
  const { id } = request.params as { id: string }
  
  const user = await prisma.user.findUnique({
    where: { id: parseInt(id) },
    include: { posts: true }
  })
  
  if (!user) {
    throw new Error('User not found')
  }
  
  return user
})

// Create post
fastify.post('/posts', async (request) => {
  const { title, content, authorId } = request.body as {
    title: string
    content?: string
    authorId: number
  }
  
  const post = await prisma.post.create({
    data: { title, content, authorId }
  })
  return post
})

// Start server
const start = async () => {
    try {
      const port = Number(process.env.PORT) || 3000
      const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost'
      
      await fastify.listen({ port, host })
      console.log(`🚀 Server running on ${host}:${port}`)
    } catch (err) {
      fastify.log.error(err)
      process.exit(1)
    }
  }
  
  start()