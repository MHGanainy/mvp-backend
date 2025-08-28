import { FastifyInstance } from 'fastify'
import { MarkingCriterionService } from './marking-criterion.service'
import {
  createMarkingCriterionSchema,
  updateMarkingCriterionSchema,
  bulkUpdateMarkingCriteriaSchema,
  markingCriterionParamsSchema,
  courseCaseParamsSchema
} from './marking-criterion.schema'

export default async function markingCriterionRoutes(fastify: FastifyInstance) {
  const service = new MarkingCriterionService(fastify.prisma)

  // GET /marking-criteria/case/:courseCaseId - Get all criteria for a case, grouped by domain
  fastify.get('/marking-criteria/case/:courseCaseId', async (request, reply) => {
    try {
      const { courseCaseId } = courseCaseParamsSchema.parse(request.params)
      const groupedCriteria = await service.findAllByCourseCase(courseCaseId)
      reply.send(groupedCriteria)
    } catch (error) {
      if (error instanceof Error && error.message === 'Course case not found') {
        reply.status(404).send({ error: 'Course case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /marking-criteria/case/:courseCaseId/stats - Get stats for a case's marking criteria
  fastify.get('/marking-criteria/case/:courseCaseId/stats', async (request, reply) => {
    try {
      const { courseCaseId } = courseCaseParamsSchema.parse(request.params)
      const stats = await service.getCaseStats(courseCaseId)
      reply.send(stats)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /marking-criteria/:id - Get a single criterion
  fastify.get('/marking-criteria/:id', async (request, reply) => {
    try {
      const { id } = markingCriterionParamsSchema.parse(request.params)
      const criterion = await service.findById(id)
      reply.send(criterion)
    } catch (error) {
      if (error instanceof Error && error.message === 'Marking criterion not found') {
        reply.status(404).send({ error: 'Marking criterion not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /marking-criteria - Create a single new criterion
  fastify.post('/marking-criteria', async (request, reply) => {
    try {
      const data = createMarkingCriterionSchema.parse(request.body)
      const criterion = await service.create(data)
      reply.status(201).send(criterion)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          reply.status(404).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /marking-criteria/case/bulk - Bulk create/update/delete criteria for a case
  fastify.put('/marking-criteria/case/bulk', async (request, reply) => {
    try {
      const data = bulkUpdateMarkingCriteriaSchema.parse(request.body)
      const updatedCriteria = await service.bulkUpdate(data)
      reply.send({
        message: 'Marking criteria updated successfully',
        count: updatedCriteria.length,
        criteria: updatedCriteria
      })
    } catch (error) {
      reply.status(400).send({ error: 'Invalid data' })
    }
  })

  // PUT /marking-criteria/:id - Update a single criterion
  fastify.put('/marking-criteria/:id', async (request, reply) => {
    try {
      const { id } = markingCriterionParamsSchema.parse(request.params)
      const data = updateMarkingCriterionSchema.parse(request.body)
      const criterion = await service.update(id, data)
      reply.send(criterion)
    } catch (error) {
      if (error instanceof Error && error.message === 'Marking criterion not found') {
        reply.status(404).send({ error: 'Marking criterion not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // DELETE /marking-criteria/:id - Delete a single criterion
  fastify.delete('/marking-criteria/:id', async (request, reply) => {
    try {
      const { id } = markingCriterionParamsSchema.parse(request.params)
      await service.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Marking criterion not found') {
        reply.status(404).send({ error: 'Marking criterion not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}