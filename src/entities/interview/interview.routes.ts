// src/entities/interview/interview.routes.ts
import { z } from 'zod'
import { FastifyInstance } from 'fastify'
import { InterviewService } from './interview.service'
import {
  createInterviewSchema,
  updateInterviewSchema,
  interviewParamsSchema,
  interviewInstructorParamsSchema,
  createCompleteInterviewSchema,
  updateCompleteInterviewSchema
} from './interview.schema'
import {
  assignInterviewSpecialtiesSchema,
  assignInterviewCurriculumsSchema,
  assignInterviewMarkingDomainsSchema,
  bulkConfigureInterviewSchema,
  interviewRemoveSpecialtyParamsSchema,
  interviewRemoveCurriculumParamsSchema,
  interviewRemoveMarkingDomainParamsSchema
} from '../../shared/junction-tables.schema'
import { authenticate, getCurrentInstructorId, isAdmin } from '../../middleware/auth.middleware'

const interviewIdParamsSchema = z.object({
  interviewId: z.string().uuid('Invalid interview ID')
})

export default async function interviewRoutes(fastify: FastifyInstance) {
  const interviewService = new InterviewService(fastify.prisma)

  // GET /interviews - Get interviews based on user role
  fastify.get('/interviews', async (request, reply) => {
    try {
      let isUserAdmin = false
      let currentInstructorId = null

      try {
        await request.jwtVerify()
        isUserAdmin = isAdmin(request)
        currentInstructorId = getCurrentInstructorId(request)
      } catch {
        // Not authenticated - public access
      }

      let interviews
      if (isUserAdmin) {
        // Admin sees ALL interviews
        interviews = await interviewService.findAll()
      } else if (currentInstructorId) {
        // Instructor sees their own interviews plus active interviews
        const instructorInterviews = await interviewService.findByInstructor(currentInstructorId)
        const activeInterviews = await interviewService.findActive()
        // Merge and deduplicate
        const interviewMap = new Map()
        ;[...instructorInterviews, ...activeInterviews].forEach(interview => {
          interviewMap.set(interview.id, interview)
        })
        interviews = Array.from(interviewMap.values())
      } else {
        // Public sees only active interviews
        interviews = await interviewService.findActive()
      }

      reply.send(interviews)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch interviews' })
    }
  })

  // GET /interviews/active - Get only active interviews
  fastify.get('/interviews/active', async (request, reply) => {
    try {
      const interviews = await interviewService.findActive()
      reply.send(interviews)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch active interviews' })
    }
  })

// GET /interviews/instructor/:instructorId - Get interviews by instructor
fastify.get('/interviews/instructor/:instructorId', async (request, reply) => {
  try {
    const { instructorId } = interviewInstructorParamsSchema.parse(request.params)

    // Check authentication and admin status
    let isUserAdmin = false
    let canViewAll = false
    try {
      await request.jwtVerify()
      isUserAdmin = isAdmin(request)
      canViewAll = isUserAdmin || getCurrentInstructorId(request) === instructorId
    } catch {
      // Not authenticated - can only see active interviews
    }

    // FIXED: Admin gets ALL interviews, not filtered by instructor
    let interviews
    if (isUserAdmin) {
      // Admin sees ALL interviews regardless of instructor
      interviews = await interviewService.findAll()
    } else if (canViewAll) {
      // Instructor sees all their own interviews
      interviews = await interviewService.findByInstructor(instructorId)
    } else {
      // Public/other users see only active interviews from this instructor
      const instructorInterviews = await interviewService.findByInstructor(instructorId)
      interviews = instructorInterviews.filter(interview => interview.isActive)
    }

    reply.send(interviews)
  } catch (error) {
    if (error instanceof Error && error.message === 'Instructor not found') {
      reply.status(404).send({ error: 'Instructor not found' })
    } else {
      reply.status(400).send({ error: 'Invalid request' })
    }
  }
})

  // GET /interviews/slug/:slug - Get interview by slug
  fastify.get('/interviews/slug/:slug', async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string }
      const interview = await interviewService.findBySlug(slug)
      reply.send(interview)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview not found') {
        reply.status(404).send({ error: 'Interview not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interviews/:id - Get interview by ID
  fastify.get('/interviews/:id', async (request, reply) => {
    try {
      const { id } = interviewParamsSchema.parse(request.params)
      const interview = await interviewService.findById(id)
      reply.send(interview)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview not found') {
        reply.status(404).send({ error: 'Interview not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /interviews - Create new interview
  fastify.post('/interviews', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createInterviewSchema.parse(request.body)

      if (!isAdmin(request)) {
        const currentInstructorId = getCurrentInstructorId(request)
        if (!currentInstructorId || currentInstructorId !== data.instructorId) {
          reply.status(403).send({ error: 'You can only create interviews for yourself' })
          return
        }
      }

      const interview = await interviewService.create(data)
      reply.status(201).send(interview)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Instructor not found') {
          reply.status(404).send({ error: 'Instructor not found' })
        } else if (error.message === 'Interview with this slug already exists') {
          reply.status(400).send({ error: 'Interview with this slug already exists' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /interviews/create-complete - Create interview with all relations
  fastify.post('/interviews/create-complete', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createCompleteInterviewSchema.parse(request.body)

      if (!isAdmin(request)) {
        const currentInstructorId = getCurrentInstructorId(request)
        if (!currentInstructorId || currentInstructorId !== data.interview.instructorId) {
          reply.status(403).send({ error: 'You can only create interviews for yourself' })
          return
        }
      }

      const result = await interviewService.createCompleteInterview(data)
      reply.status(201).send({
        message: 'Interview created and configured successfully',
        ...result
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Instructor not found') {
          reply.status(404).send({ error: 'Instructor not found' })
        } else if (error.message === 'Interview with this slug already exists') {
          reply.status(400).send({ error: 'Interview with this slug already exists' })
        } else if (error.message.includes('not found')) {
          reply.status(404).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data: ' + error.message })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /interviews/:id - Update interview
  fastify.put('/interviews/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewParamsSchema.parse(request.params)
      const data = updateInterviewSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interview = await interviewService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interview.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only edit your own interviews' })
          return
        }
      }

      const interview = await interviewService.update(id, data)
      reply.send(interview)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview not found') {
          reply.status(404).send({ error: 'Interview not found' })
        } else if (error.message === 'Interview with this slug already exists') {
          reply.status(400).send({ error: 'Interview with this slug already exists' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /interviews/update-complete - Update interview with all relations
  fastify.put('/interviews/update-complete', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = updateCompleteInterviewSchema.parse(request.body)
      const { interviewId, ...updateData } = data

      if (!isAdmin(request)) {
        const interview = await interviewService.findById(interviewId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interview.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only edit your own interviews' })
          return
        }
      }

      const result = await interviewService.updateCompleteInterview(interviewId, updateData)
      reply.send({
        message: 'Interview updated and configured successfully',
        ...result
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview not found') {
          reply.status(404).send({ error: 'Interview not found' })
        } else if (error.message === 'Interview with this slug already exists') {
          reply.status(400).send({ error: 'Interview with this slug already exists' })
        } else if (error.message.includes('not found')) {
          reply.status(404).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data: ' + error.message })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PATCH /interviews/:id/toggle - Toggle interview active status
  fastify.patch('/interviews/:id/toggle', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewParamsSchema.parse(request.params)

      if (!isAdmin(request)) {
        const interview = await interviewService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interview.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only toggle your own interviews' })
          return
        }
      }

      const interview = await interviewService.toggleActive(id)
      reply.send({
        message: `Interview ${interview.isActive ? 'activated' : 'deactivated'} successfully`,
        interview
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview not found') {
        reply.status(404).send({ error: 'Interview not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // DELETE /interviews/:id - Delete interview
  fastify.delete('/interviews/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewParamsSchema.parse(request.params)

      if (!isAdmin(request)) {
        const interview = await interviewService.findById(id)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interview.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only delete your own interviews' })
          return
        }
      }

      await interviewService.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview not found') {
        reply.status(404).send({ error: 'Interview not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interviews/:interviewId/configuration
  fastify.get('/interviews/:interviewId/configuration', async (request, reply) => {
    try {
      const { interviewId } = interviewIdParamsSchema.parse(request.params)
      const configuration = await interviewService.getInterviewConfiguration(interviewId)
      reply.send(configuration)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview not found') {
        reply.status(404).send({ error: 'Interview not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interviews/:interviewId/specialties
  fastify.get('/interviews/:interviewId/specialties', async (request, reply) => {
    try {
      const { interviewId } = interviewIdParamsSchema.parse(request.params)
      const specialties = await interviewService.getInterviewSpecialties(interviewId)
      reply.send(specialties)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview not found') {
        reply.status(404).send({ error: 'Interview not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interviews/:interviewId/curriculums
  fastify.get('/interviews/:interviewId/curriculums', async (request, reply) => {
    try {
      const { interviewId } = interviewIdParamsSchema.parse(request.params)
      const curriculums = await interviewService.getInterviewCurriculums(interviewId)
      reply.send(curriculums)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview not found') {
        reply.status(404).send({ error: 'Interview not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interviews/:interviewId/marking-domains
  fastify.get('/interviews/:interviewId/marking-domains', async (request, reply) => {
    try {
      const { interviewId } = interviewIdParamsSchema.parse(request.params)
      const markingDomains = await interviewService.getInterviewMarkingDomains(interviewId)
      reply.send(markingDomains)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview not found') {
        reply.status(404).send({ error: 'Interview not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interviews/:interviewId/usage-stats
  fastify.get('/interviews/:interviewId/usage-stats', async (request, reply) => {
    try {
      const { interviewId } = interviewIdParamsSchema.parse(request.params)
      const stats = await interviewService.getInterviewUsageStats(interviewId)
      reply.send(stats)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview not found') {
        reply.status(404).send({ error: 'Interview not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /interviews/assign-specialties
  fastify.post('/interviews/assign-specialties', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { interviewId, specialtyIds } = assignInterviewSpecialtiesSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interview = await interviewService.findById(interviewId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interview.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify your own interviews' })
          return
        }
      }

      const result = await interviewService.assignSpecialties(interviewId, specialtyIds)
      reply.send({
        message: 'Specialties assigned to interview successfully',
        assignments: result,
        interviewId,
        specialtiesCount: specialtyIds.length
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview not found') {
          reply.status(404).send({ error: 'Interview not found' })
        } else if (error.message === 'One or more specialties not found') {
          reply.status(404).send({ error: 'One or more specialties not found' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /interviews/assign-curriculums
  fastify.post('/interviews/assign-curriculums', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { interviewId, curriculumIds } = assignInterviewCurriculumsSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interview = await interviewService.findById(interviewId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interview.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify your own interviews' })
          return
        }
      }

      const result = await interviewService.assignCurriculums(interviewId, curriculumIds)
      reply.send({
        message: 'Curriculum items assigned to interview successfully',
        assignments: result,
        interviewId,
        curriculumsCount: curriculumIds.length
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview not found') {
          reply.status(404).send({ error: 'Interview not found' })
        } else if (error.message === 'One or more curriculum items not found') {
          reply.status(404).send({ error: 'One or more curriculum items not found' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /interviews/assign-marking-domains
  fastify.post('/interviews/assign-marking-domains', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { interviewId, markingDomainIds } = assignInterviewMarkingDomainsSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interview = await interviewService.findById(interviewId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interview.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify your own interviews' })
          return
        }
      }

      const result = await interviewService.assignMarkingDomains(interviewId, markingDomainIds)
      reply.send({
        message: 'Marking domains assigned to interview successfully',
        assignments: result,
        interviewId,
        markingDomainsCount: markingDomainIds.length
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview not found') {
          reply.status(404).send({ error: 'Interview not found' })
        } else if (error.message === 'One or more marking domains not found') {
          reply.status(404).send({ error: 'One or more marking domains not found' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /interviews/bulk-configure
  fastify.post('/interviews/bulk-configure', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { interviewId, ...configuration } = bulkConfigureInterviewSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interview = await interviewService.findById(interviewId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interview.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify your own interviews' })
          return
        }
      }

      const result = await interviewService.bulkConfigureInterview(interviewId, configuration)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview not found') {
          reply.status(404).send({ error: 'Interview not found' })
        } else if (error.message.includes('not found')) {
          reply.status(404).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // DELETE /interviews/:interviewId/specialties/:specialtyId
  fastify.delete('/interviews/:interviewId/specialties/:specialtyId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { interviewId, specialtyId } = interviewRemoveSpecialtyParamsSchema.parse(request.params)

      if (!isAdmin(request)) {
        const interview = await interviewService.findById(interviewId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interview.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify your own interviews' })
          return
        }
      }

      const result = await interviewService.removeSpecialty(interviewId, specialtyId)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview not found') {
          reply.status(404).send({ error: 'Interview not found' })
        } else if (error.message === 'Specialty assignment not found') {
          reply.status(404).send({ error: 'Specialty assignment not found' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // DELETE /interviews/:interviewId/curriculums/:curriculumId
  fastify.delete('/interviews/:interviewId/curriculums/:curriculumId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { interviewId, curriculumId } = interviewRemoveCurriculumParamsSchema.parse(request.params)

      if (!isAdmin(request)) {
        const interview = await interviewService.findById(interviewId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interview.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify your own interviews' })
          return
        }
      }

      const result = await interviewService.removeCurriculum(interviewId, curriculumId)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview not found') {
          reply.status(404).send({ error: 'Interview not found' })
        } else if (error.message === 'Curriculum assignment not found') {
          reply.status(404).send({ error: 'Curriculum assignment not found' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // DELETE /interviews/:interviewId/marking-domains/:markingDomainId
  fastify.delete('/interviews/:interviewId/marking-domains/:markingDomainId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { interviewId, markingDomainId } = interviewRemoveMarkingDomainParamsSchema.parse(request.params)

      if (!isAdmin(request)) {
        const interview = await interviewService.findById(interviewId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interview.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify your own interviews' })
          return
        }
      }

      const result = await interviewService.removeMarkingDomain(interviewId, markingDomainId)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview not found') {
          reply.status(404).send({ error: 'Interview not found' })
        } else if (error.message === 'Marking domain assignment not found') {
          reply.status(404).send({ error: 'Marking domain assignment not found' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // GET /interviews/:interviewId/with-configuration
  fastify.get('/interviews/:interviewId/with-configuration', async (request, reply) => {
    try {
      const { interviewId } = interviewIdParamsSchema.parse(request.params)
      const interviewWithConfig = await interviewService.getInterviewWithConfiguration(interviewId)
      reply.send(interviewWithConfig)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview not found') {
        reply.status(404).send({ error: 'Interview not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /interviews/:interviewId/clear-configuration
  fastify.post('/interviews/:interviewId/clear-configuration', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { interviewId } = interviewIdParamsSchema.parse(request.params)

      if (!isAdmin(request)) {
        const interview = await interviewService.findById(interviewId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interview.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify your own interviews' })
          return
        }
      }

      const result = await interviewService.clearInterviewConfiguration(interviewId)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview not found') {
        reply.status(404).send({ error: 'Interview not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interviews/:interviewId/is-configured
  fastify.get('/interviews/:interviewId/is-configured', async (request, reply) => {
    try {
      const { interviewId } = interviewIdParamsSchema.parse(request.params)
      const isConfigured = await interviewService.isInterviewFullyConfigured(interviewId)
      reply.send({
        interviewId,
        isFullyConfigured: isConfigured
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview not found') {
        reply.status(404).send({ error: 'Interview not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}
