// src/entities/interview-case/interview-case.routes.ts
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { InterviewCaseService } from './interview-case.service'
import { InterviewCourseService } from '../interview-course/interview-course.service'
import {
  createInterviewCaseSchema,
  updateInterviewCaseSchema,
  interviewCaseParamsSchema,
  interviewCaseInterviewCourseParamsSchema,
  reorderInterviewCaseSchema,
  PatientGenderEnum,
  createCompleteInterviewCaseSchema,
  updateCompleteInterviewCaseSchema,
  paginatedInterviewCasesQuerySchema
} from './interview-case.schema'
import {
  assignInterviewCaseSpecialtiesSchema as assignSpecialtiesSchema,
  assignInterviewCaseCurriculumsSchema as assignCurriculumsSchema,
  filterInterviewCasesSchema as filterCasesSchema,
  bulkAssignInterviewCaseFiltersSchema as bulkAssignFiltersSchema,
  removeInterviewCaseSpecialtySchema as removeSpecialtySchema,
  removeInterviewCaseCurriculumSchema as removeCurriculumSchema,
  interviewCaseParamsSchema as junctionInterviewCaseParamsSchema,
  interviewCourseParamsSchemaForJunction as courseParamsSchema,
  interviewCaseSpecialtyRemoveParamsSchema as specialtyRemoveParamsSchema,
  interviewCaseCurriculumRemoveParamsSchema as curriculumRemoveParamsSchema,
  filterInterviewCaseQuerySchema as filterQuerySchema
} from '../../shared/junction-tables.schema'
import { authenticate, getCurrentInstructorId, isAdmin } from '../../middleware/auth.middleware'
import { replyInternalError } from '../../shared/route-error'

const genderParamsSchema = z.object({
  interviewCourseId: z.string().uuid('Invalid interview course ID'),
  gender: PatientGenderEnum
})

export default async function interviewCaseRoutes(fastify: FastifyInstance) {
  const interviewCaseService = new InterviewCaseService(fastify.prisma)
  const interviewCourseService = new InterviewCourseService(fastify.prisma)

  // GET /interview-cases - Get interview cases based on user role
  fastify.get('/interview-cases', async (request, reply) => {
    try {
      let isUserAdmin = false
      let currentInstructorId = null

      try {
        await request.jwtVerify()
        isUserAdmin = isAdmin(request)
        currentInstructorId = getCurrentInstructorId(request)
      } catch {
        // Not authenticated
      }

      let interviewCases
      if (isUserAdmin) {
        // Admin sees ALL cases
        interviewCases = await interviewCaseService.findAll()
      } else if (currentInstructorId) {
        // Instructor sees cases from their interview courses
        const instructorInterviewCourses = await interviewCourseService.findByInstructor(currentInstructorId)
        const interviewCourseIds = instructorInterviewCourses.map(c => c.id)
        interviewCases = await fastify.prisma.interviewCase.findMany({
          where: { interviewCourseId: { in: interviewCourseIds } },
          include: interviewCaseService.getStandardInclude(),
          orderBy: [
            { interviewCourseId: 'asc' },
            { displayOrder: 'asc' }
          ]
        })
      } else {
        // Public sees only free cases from published interview courses
        const publishedInterviewCourses = await interviewCourseService.findPublished()
        const interviewCourseIds = publishedInterviewCourses.map(c => c.id)
        interviewCases = await fastify.prisma.interviewCase.findMany({
          where: {
            interviewCourseId: { in: interviewCourseIds },
            isFree: true
          },
          include: interviewCaseService.getStandardInclude(),
          orderBy: [
            { interviewCourseId: 'asc' },
            { displayOrder: 'asc' }
          ]
        })
      }

      reply.send(interviewCases)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch interview cases')
    }
  })

  // GET /interviews/:interviewSlug/courses/:courseSlug/cases/:caseSlug - Get interview case by slugs (clean URL)
  fastify.get('/interviews/:interviewSlug/courses/:courseSlug/cases/:caseSlug', async (request, reply) => {
    try {
      const { interviewSlug, courseSlug, caseSlug } = request.params as {
        interviewSlug: string
        courseSlug: string
        caseSlug: string
      }
      const interviewCase = await interviewCaseService.findBySlug(interviewSlug, courseSlug, caseSlug)
      reply.send(interviewCase)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview not found') {
          reply.status(404).send({ error: 'Interview not found' })
        } else if (error.message === 'Interview course not found') {
          reply.status(404).send({ error: 'Interview course not found' })
        } else if (error.message === 'Interview case not found') {
          reply.status(404).send({ error: 'Interview case not found' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interviews/:interviewSlug/courses/:courseSlug/cases/:caseSlug/complete - Get complete interview case by slugs
  fastify.get('/interviews/:interviewSlug/courses/:courseSlug/cases/:caseSlug/complete', async (request, reply) => {
    try {
      const { interviewSlug, courseSlug, caseSlug } = request.params as {
        interviewSlug: string
        courseSlug: string
        caseSlug: string
      }

      // Use findBySlug to get the case first
      const caseLookup = await interviewCaseService.findBySlug(interviewSlug, courseSlug, caseSlug)
      const id = caseLookup.id

      // Now get the complete data using the ID
      const interviewCase = await fastify.prisma.interviewCase.findUnique({
        where: { id },
        include: {
          interviewCourse: {
            include: {
              interview: {
                select: {
                  id: true,
                  title: true,
                  slug: true
                }
              }
            }
          },
          interviewSimulation: true,
          interviewCaseTabs: true,
          interviewMarkingCriteria: {
            include: {
              markingDomain: true
            },
            orderBy: [
              { markingDomain: { name: 'asc' } },
              { displayOrder: 'asc' }
            ]
          },
          interviewCaseSpecialties: {
            include: {
              specialty: true
            }
          },
          interviewCaseCurriculums: {
            include: {
              curriculum: true
            }
          }
        }
      })

      if (!interviewCase) {
        reply.status(404).send({ error: 'Interview case not found' })
        return
      }

      const tabsResponse: any = {}
      for (const tab of interviewCase.interviewCaseTabs) {
        tabsResponse[tab.tabType] = {
          id: tab.id,
          content: tab.content,
          hasContent: tab.content.length > 0
        }
      }

      const markingCriteriaGrouped = interviewCase.interviewMarkingCriteria.reduce((acc, criterion) => {
        const domainId = criterion.markingDomain.id
        const domainName = criterion.markingDomain.name

        let group = acc.find((g: any) => g.domainId === domainId)
        if (!group) {
          group = { domainId, domainName, criteria: [] }
          acc.push(group)
        }

        group.criteria.push({
          id: criterion.id,
          text: criterion.text,
          points: criterion.points,
          displayOrder: criterion.displayOrder
        })

        return acc
      }, [] as any[])

      const specialties = interviewCase.interviewCaseSpecialties.map((cs: any) => cs.specialty)
      const curriculums = interviewCase.interviewCaseCurriculums.map((cc: any) => cc.curriculum)

      reply.send({
        interviewCase: {
          id: interviewCase.id,
          interviewCourseId: interviewCase.interviewCourseId,
          slug: interviewCase.slug,
          title: interviewCase.title,
          diagnosis: interviewCase.diagnosis,
          patientName: interviewCase.patientName,
          patientAge: interviewCase.patientAge,
          patientGender: interviewCase.patientGender,
          description: interviewCase.description,
          isFree: interviewCase.isFree,
          displayOrder: interviewCase.displayOrder,
          createdAt: interviewCase.createdAt,
          updatedAt: interviewCase.updatedAt
        },
        tabs: tabsResponse,
        markingCriteria: markingCriteriaGrouped,
        specialties,
        curriculums,
        interviewSimulation: interviewCase.interviewSimulation,
        interviewCourse: interviewCase.interviewCourse
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview not found') {
          reply.status(404).send({ error: 'Interview not found' })
        } else if (error.message === 'Interview course not found') {
          reply.status(404).send({ error: 'Interview course not found' })
        } else if (error.message === 'Interview case not found') {
          reply.status(404).send({ error: 'Interview case not found' })
        } else {
          request.log.error({ err: error }, 'Error fetching complete interview case by slug')
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        request.log.error({ err: error }, 'Error fetching complete interview case by slug')
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interview-cases/interview-course/:interviewCourseId - Get cases by interview course
  fastify.get('/interview-cases/interview-course/:interviewCourseId', async (request, reply) => {
    try {
      const { interviewCourseId } = interviewCaseInterviewCourseParamsSchema.parse(request.params)
      const interviewCases = await interviewCaseService.findByInterviewCourse(interviewCourseId)
      reply.send(interviewCases)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview course not found') {
        reply.status(404).send({ error: 'Interview course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interview-cases/interview-course/:interviewCourseId/paginated
  fastify.get('/interview-cases/interview-course/:interviewCourseId/paginated', async (request, reply) => {
    try {
      const { interviewCourseId } = interviewCaseInterviewCourseParamsSchema.parse(request.params)
      const queryParams = paginatedInterviewCasesQuerySchema.parse(request.query)

      const result = await interviewCaseService.findByInterviewCoursePaginated(interviewCourseId, {
        page: queryParams.page,
        limit: queryParams.limit,
        specialtyIds: queryParams.specialtyIds,
        curriculumIds: queryParams.curriculumIds,
        search: queryParams.search,
        studentId: queryParams.studentId,
        notPracticed: queryParams.notPracticed,
        bookmarked: queryParams.bookmarked
      })

      reply.send(result)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview course not found') {
        reply.status(404).send({ error: 'Interview course not found' })
      } else if (error instanceof z.ZodError) {
        reply.status(400).send({ error: 'Invalid query parameters', details: error.errors })
      } else {
        replyInternalError(request, reply, error, 'Failed to fetch paginated interview cases')
      }
    }
  })

  // GET /interview-cases/interview-course/:interviewCourseId/free
  fastify.get('/interview-cases/interview-course/:interviewCourseId/free', async (request, reply) => {
    try {
      const { interviewCourseId } = interviewCaseInterviewCourseParamsSchema.parse(request.params)
      const interviewCases = await interviewCaseService.findFreeCases(interviewCourseId)
      reply.send(interviewCases)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /interview-cases/interview-course/:interviewCourseId/paid
  fastify.get('/interview-cases/interview-course/:interviewCourseId/paid', async (request, reply) => {
    try {
      const { interviewCourseId } = interviewCaseInterviewCourseParamsSchema.parse(request.params)
      const interviewCases = await interviewCaseService.findPaidCases(interviewCourseId)
      reply.send(interviewCases)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /interview-cases/interview-course/:interviewCourseId/gender/:gender
  fastify.get('/interview-cases/interview-course/:interviewCourseId/gender/:gender', async (request, reply) => {
    try {
      const { interviewCourseId, gender } = genderParamsSchema.parse(request.params)
      const interviewCases = await interviewCaseService.findByGender(interviewCourseId, gender)
      reply.send(interviewCases)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /interview-cases/interview-course/:interviewCourseId/stats
  fastify.get('/interview-cases/interview-course/:interviewCourseId/stats', async (request, reply) => {
    try {
      const { interviewCourseId } = interviewCaseInterviewCourseParamsSchema.parse(request.params)
      const stats = await interviewCaseService.getCaseStats(interviewCourseId)
      reply.send(stats)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /interview-cases/interview-course/:interviewCourseId/age-range
  fastify.get('/interview-cases/interview-course/:interviewCourseId/age-range', async (request, reply) => {
    try {
      const { interviewCourseId } = interviewCaseInterviewCourseParamsSchema.parse(request.params)
      const ageRange = await interviewCaseService.getAgeRange(interviewCourseId)
      reply.send(ageRange)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /interview-cases/:id
  fastify.get('/interview-cases/:id', async (request, reply) => {
    try {
      const { id } = interviewCaseParamsSchema.parse(request.params)
      const interviewCase = await interviewCaseService.findById(id)
      reply.send(interviewCase)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview case not found') {
        reply.status(404).send({ error: 'Interview case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /interview-cases - Create new interview case
  fastify.post('/interview-cases', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createInterviewCaseSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interviewCourse = await interviewCourseService.findById(data.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only create cases for your own interview courses' })
          return
        }
      }

      const interviewCase = await interviewCaseService.create(data)
      reply.status(201).send(interviewCase)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview course not found') {
          reply.status(404).send({ error: 'Interview course not found' })
        } else if (error.message === 'Cases can only be added to RANDOM style interview courses') {
          reply.status(400).send({ error: 'Cases can only be added to RANDOM style interview courses' })
        } else if (error.message.includes('Display order') && error.message.includes('already taken')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to create interview case')
      }
    }
  })

  // PUT /interview-cases/:id - Update interview case
  fastify.put('/interview-cases/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCaseParamsSchema.parse(request.params)
      const data = updateInterviewCaseSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interviewCase = await interviewCaseService.findById(id)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only edit cases for your own interview courses' })
          return
        }
      }

      const interviewCase = await interviewCaseService.update(id, data)
      reply.send(interviewCase)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview case not found') {
          reply.status(404).send({ error: 'Interview case not found' })
        } else if (error.message.includes('Display order') && error.message.includes('already taken')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to update interview case')
      }
    }
  })

  // PATCH /interview-cases/:id/toggle-free
  fastify.patch('/interview-cases/:id/toggle-free', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCaseParamsSchema.parse(request.params)

      if (!isAdmin(request)) {
        const interviewCase = await interviewCaseService.findById(id)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify cases for your own interview courses' })
          return
        }
      }

      const interviewCase = await interviewCaseService.toggleFree(id)
      reply.send({
        message: `Case ${interviewCase.isFree ? 'marked as free' : 'marked as paid'} successfully`,
        interviewCase
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview case not found') {
        reply.status(404).send({ error: 'Interview case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // PATCH /interview-cases/:id/reorder
  fastify.patch('/interview-cases/:id/reorder', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCaseParamsSchema.parse(request.params)
      const { newOrder } = reorderInterviewCaseSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interviewCase = await interviewCaseService.findById(id)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only reorder cases for your own interview courses' })
          return
        }
      }

      const interviewCase = await interviewCaseService.reorder(id, newOrder)
      reply.send({
        message: `Case reordered to position ${newOrder} successfully`,
        interviewCase
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview case not found') {
          reply.status(404).send({ error: 'Interview case not found' })
        } else if (error.message.includes('Display order') && error.message.includes('already taken')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to reorder interview case')
      }
    }
  })

  // DELETE /interview-cases/:id
  fastify.delete('/interview-cases/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCaseParamsSchema.parse(request.params)

      if (!isAdmin(request)) {
        const interviewCase = await interviewCaseService.findById(id)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only delete cases from your own interview courses' })
          return
        }
      }

      await interviewCaseService.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview case not found') {
        reply.status(404).send({ error: 'Interview case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interview-cases/interview-course/:interviewCourseId/filtered
  fastify.get('/interview-cases/interview-course/:interviewCourseId/filtered', async (request, reply) => {
    try {
      const { interviewCourseId } = courseParamsSchema.parse(request.params)
      const filters = filterQuerySchema.parse(request.query)

      const interviewCases = await interviewCaseService.findByFilters(interviewCourseId, {
        specialtyIds: filters.specialtyIds,
        curriculumIds: filters.curriculumIds,
        isFree: filters.isFree,
        patientGender: filters.patientGender
      })

      reply.send(interviewCases)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid filter parameters' })
    }
  })

  // GET /interview-cases/:interviewCaseId/specialties
  fastify.get('/interview-cases/:interviewCaseId/specialties', async (request, reply) => {
    try {
      const { interviewCaseId } = junctionInterviewCaseParamsSchema.parse(request.params)
      const specialties = await interviewCaseService.getCaseSpecialties(interviewCaseId)
      reply.send(specialties)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview case not found') {
        reply.status(404).send({ error: 'Interview case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interview-cases/:interviewCaseId/curriculums
  fastify.get('/interview-cases/:interviewCaseId/curriculums', async (request, reply) => {
    try {
      const { interviewCaseId } = junctionInterviewCaseParamsSchema.parse(request.params)
      const curriculums = await interviewCaseService.getCaseCurriculums(interviewCaseId)
      reply.send(curriculums)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview case not found') {
        reply.status(404).send({ error: 'Interview case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /interview-cases/assign-specialties
  fastify.post('/interview-cases/assign-specialties', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { courseCaseId, specialtyIds } = assignSpecialtiesSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interviewCase = await interviewCaseService.findById(courseCaseId)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify cases for your own interview courses' })
          return
        }
      }

      const result = await interviewCaseService.assignSpecialties(courseCaseId, specialtyIds)
      reply.send({
        message: 'Specialties assigned successfully',
        assignments: result,
        interviewCaseId: courseCaseId,
        specialtiesCount: specialtyIds.length
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview case not found') {
          reply.status(404).send({ error: 'Interview case not found' })
        } else if (error.message === 'One or more specialties not found') {
          reply.status(404).send({ error: 'One or more specialties not found' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to assign specialties to interview case')
      }
    }
  })

  // POST /interview-cases/assign-curriculums
  fastify.post('/interview-cases/assign-curriculums', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { courseCaseId, curriculumIds } = assignCurriculumsSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interviewCase = await interviewCaseService.findById(courseCaseId)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify cases for your own interview courses' })
          return
        }
      }

      const result = await interviewCaseService.assignCurriculums(courseCaseId, curriculumIds)
      reply.send({
        message: 'Curriculum items assigned successfully',
        assignments: result,
        interviewCaseId: courseCaseId,
        curriculumsCount: curriculumIds.length
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview case not found') {
          reply.status(404).send({ error: 'Interview case not found' })
        } else if (error.message === 'One or more curriculum items not found') {
          reply.status(404).send({ error: 'One or more curriculum items not found' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to assign curriculums to interview case')
      }
    }
  })

  // POST /interview-cases/bulk-assign-filters
  fastify.post('/interview-cases/bulk-assign-filters', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { assignments } = bulkAssignFiltersSchema.parse(request.body)

      // Check permissions for each case
      if (!isAdmin(request)) {
        for (const assignment of assignments) {
          const interviewCase = await interviewCaseService.findById(assignment.courseCaseId)
          const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
          const currentInstructorId = getCurrentInstructorId(request)

          if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
            reply.status(403).send({ error: 'You can only modify cases for your own interview courses' })
            return
          }
        }
      }

      const result = await interviewCaseService.bulkAssignFilters(assignments)
      reply.send({
        message: 'Bulk assignment completed successfully',
        result,
        processedCases: assignments.length
      })
    } catch (error) {
      if (error instanceof Error) {
        reply.status(400).send({ error: error.message })
      } else {
        replyInternalError(request, reply, error, 'Failed to bulk assign filters to interview cases')
      }
    }
  })

  // DELETE /interview-cases/:interviewCaseId/specialties/:specialtyId
  fastify.delete('/interview-cases/:interviewCaseId/specialties/:specialtyId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { courseCaseId, specialtyId } = specialtyRemoveParamsSchema.parse(request.params)

      if (!isAdmin(request)) {
        const interviewCase = await interviewCaseService.findById(courseCaseId)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify cases for your own interview courses' })
          return
        }
      }

      const result = await interviewCaseService.removeSpecialty(courseCaseId, specialtyId)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview case not found') {
          reply.status(404).send({ error: 'Interview case not found' })
        } else if (error.message === 'Specialty assignment not found') {
          reply.status(404).send({ error: 'Specialty assignment not found' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to remove specialty from interview case')
      }
    }
  })

  // DELETE /interview-cases/:interviewCaseId/curriculums/:curriculumId
  fastify.delete('/interview-cases/:interviewCaseId/curriculums/:curriculumId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { courseCaseId, curriculumId } = curriculumRemoveParamsSchema.parse(request.params)

      if (!isAdmin(request)) {
        const interviewCase = await interviewCaseService.findById(courseCaseId)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify cases for your own interview courses' })
          return
        }
      }

      const result = await interviewCaseService.removeCurriculum(courseCaseId, curriculumId)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview case not found') {
          reply.status(404).send({ error: 'Interview case not found' })
        } else if (error.message === 'Curriculum assignment not found') {
          reply.status(404).send({ error: 'Curriculum assignment not found' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to remove curriculum from interview case')
      }
    }
  })

  // GET /interview-cases/interview-course/:interviewCourseId/filtering-stats
  fastify.get('/interview-cases/interview-course/:interviewCourseId/filtering-stats', async (request, reply) => {
    try {
      const { interviewCourseId } = courseParamsSchema.parse(request.params)
      const stats = await interviewCaseService.getFilteringStats(interviewCourseId)
      reply.send(stats)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /interview-cases/interview-course/:interviewCourseId/available-filters
  fastify.get('/interview-cases/interview-course/:interviewCourseId/available-filters', async (request, reply) => {
    try {
      const { interviewCourseId } = courseParamsSchema.parse(request.params)

      const interviewCases = await interviewCaseService.findByInterviewCourse(interviewCourseId)

      const uniqueSpecialties = new Set()
      const uniqueCurriculums = new Set()
      const availableGenders = new Set()

      interviewCases.forEach((interviewCase: any) => {
        availableGenders.add(interviewCase.patientGender)

        if (interviewCase.interviewCaseSpecialties) {
          interviewCase.interviewCaseSpecialties.forEach((cs: any) => {
            uniqueSpecialties.add(JSON.stringify({
              id: cs.specialty.id,
              name: cs.specialty.name
            }))
          })
        }

        if (interviewCase.interviewCaseCurriculums) {
          interviewCase.interviewCaseCurriculums.forEach((cc: any) => {
            uniqueCurriculums.add(JSON.stringify({
              id: cc.curriculum.id,
              name: cc.curriculum.name
            }))
          })
        }
      })

      reply.send({
        interviewCourseId,
        availableFilters: {
          specialties: Array.from(uniqueSpecialties).map((s: any) => JSON.parse(s)),
          curriculums: Array.from(uniqueCurriculums).map((c: any) => JSON.parse(c)),
          genders: Array.from(availableGenders),
          freeOptions: [true, false]
        }
      })
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // POST /interview-cases/create-complete
  fastify.post('/interview-cases/create-complete', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createCompleteInterviewCaseSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interviewCourse = await interviewCourseService.findById(data.interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only create cases for your own interview courses' })
          return
        }
      }

      const result = await interviewCaseService.createCompleteInterviewCase(data)
      reply.status(201).send({
        message: 'Interview case created and configured successfully',
        ...result
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview course not found') {
          reply.status(404).send({ error: 'Interview course not found' })
        } else if (error.message === 'Cases can only be added to RANDOM style interview courses') {
          reply.status(400).send({ error: 'Cases can only be added to RANDOM style interview courses' })
        } else if (error.message.includes('Display order') && error.message.includes('already taken')) {
          reply.status(400).send({ error: error.message })
        } else if (error.message.includes('not found')) {
          reply.status(404).send({ error: error.message })
        } else if (error.message === 'Warning time must be less than time limit') {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data: ' + error.message })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to create complete interview case')
      }
    }
  })

  // PUT /interview-cases/update-complete
  fastify.put('/interview-cases/update-complete', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = updateCompleteInterviewCaseSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interviewCase = await interviewCaseService.findById(data.interviewCaseId)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only update cases for your own interview courses' })
          return
        }
      }

      const result = await interviewCaseService.updateCompleteInterviewCase(data)
      reply.send({
        message: 'Interview case updated successfully',
        ...result
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview case not found') {
          reply.status(404).send({ error: 'Interview case not found' })
        } else if (error.message.includes('Display order') && error.message.includes('already taken')) {
          reply.status(400).send({ error: error.message })
        } else if (error.message.includes('not found')) {
          reply.status(404).send({ error: error.message })
        } else if (error.message === 'Warning time must be less than time limit') {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data: ' + error.message })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to update complete interview case')
      }
    }
  })

  // GET /interview-cases/:id/complete
  fastify.get('/interview-cases/:id/complete', async (request, reply) => {
    try {
      const { id } = interviewCaseParamsSchema.parse(request.params)

      const interviewCase = await fastify.prisma.interviewCase.findUnique({
        where: { id },
        include: {
          interviewCourse: {
            include: {
              interview: {
                select: {
                  id: true,
                  title: true,
                  slug: true
                }
              }
            }
          },
          interviewSimulation: true,
          interviewCaseTabs: true,
          interviewMarkingCriteria: {
            include: {
              markingDomain: true
            },
            orderBy: [
              { markingDomain: { name: 'asc' } },
              { displayOrder: 'asc' }
            ]
          },
          interviewCaseSpecialties: {
            include: {
              specialty: true
            }
          },
          interviewCaseCurriculums: {
            include: {
              curriculum: true
            }
          }
        }
      })

      if (!interviewCase) {
        reply.status(404).send({ error: 'Interview case not found' })
        return
      }

      const tabsResponse: any = {}
      for (const tab of interviewCase.interviewCaseTabs) {
        tabsResponse[tab.tabType] = {
          id: tab.id,
          content: tab.content,
          hasContent: tab.content.length > 0
        }
      }

      const markingCriteriaGrouped = interviewCase.interviewMarkingCriteria.reduce((acc, criterion) => {
        const domainId = criterion.markingDomain.id
        const domainName = criterion.markingDomain.name

        let group = acc.find((g: any) => g.domainId === domainId)
        if (!group) {
          group = { domainId, domainName, criteria: [] }
          acc.push(group)
        }

        group.criteria.push({
          id: criterion.id,
          text: criterion.text,
          points: criterion.points,
          displayOrder: criterion.displayOrder
        })

        return acc
      }, [] as any[])

      const specialties = interviewCase.interviewCaseSpecialties.map((cs: any) => cs.specialty)
      const curriculums = interviewCase.interviewCaseCurriculums.map((cc: any) => cc.curriculum)

      reply.send({
        interviewCase: {
          id: interviewCase.id,
          interviewCourseId: interviewCase.interviewCourseId,
          title: interviewCase.title,
          diagnosis: interviewCase.diagnosis,
          patientName: interviewCase.patientName,
          patientAge: interviewCase.patientAge,
          patientGender: interviewCase.patientGender,
          description: interviewCase.description,
          isFree: interviewCase.isFree,
          displayOrder: interviewCase.displayOrder,
          createdAt: interviewCase.createdAt,
          updatedAt: interviewCase.updatedAt
        },
        tabs: tabsResponse,
        markingCriteria: markingCriteriaGrouped,
        specialties,
        curriculums,
        interviewSimulation: interviewCase.interviewSimulation,
        interviewCourse: interviewCase.interviewCourse
      })
    } catch (error) {
      request.log.error({ err: error }, 'Error fetching complete interview case')
      reply.status(400).send({ error: 'Invalid request' })
    }
  })
}
