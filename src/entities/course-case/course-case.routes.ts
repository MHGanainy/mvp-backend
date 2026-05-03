// src/entities/course-case/course-case.routes.ts
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CourseCaseService } from './course-case.service'
import {
  createCourseCaseSchema,
  updateCourseCaseSchema,
  courseCaseParamsSchema,
  courseCaseCourseParamsSchema,
  reorderCourseCaseSchema,
  PatientGenderEnum,
  createCompleteCourseCaseSchema,
  updateCompleteCourseCaseSchema,
  paginatedCourseCasesQuerySchema
} from './course-case.schema'
import {
  assignSpecialtiesSchema,
  assignCurriculumsSchema,
  filterCasesSchema,
  bulkAssignFiltersSchema,
  removeSpecialtySchema,
  removeCurriculumSchema,
  courseCaseParamsSchema as junctionCourseCaseParamsSchema,
  courseParamsSchema,
  specialtyRemoveParamsSchema,
  curriculumRemoveParamsSchema,
  filterQuerySchema
} from '../../shared/junction-tables.schema'
import { authenticate, isAdmin } from '../../middleware/auth.middleware'
import { requirePermission } from '../../middleware/require-permission.middleware'
import { courseCaseVisibilityFilter, resolveViewerFromRequest, userHasPermission } from '../../shared/permissions'
import { replyInternalError } from '../../shared/route-error'

const genderParamsSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  gender: PatientGenderEnum
})

export default async function courseCaseRoutes(fastify: FastifyInstance) {
  const courseCaseService = new CourseCaseService(fastify.prisma)

  // GET /course-cases - Get course cases based on user role / grants
  fastify.get('/course-cases', async (request, reply) => {
    try {
      const { userId, isAdmin } = resolveViewerFromRequest(request)
      const visibilityWhere = await courseCaseVisibilityFilter(fastify.prisma, userId, isAdmin)

      // Public callers also get the existing "free only" restriction
      const where: any = userId === null
        ? { AND: [visibilityWhere, { isFree: true }] }
        : visibilityWhere

      const courseCases = await fastify.prisma.courseCase.findMany({
        where,
        include: courseCaseService.getStandardInclude(),
        orderBy: [
          { courseId: 'asc' },
          { displayOrder: 'asc' }
        ]
      })

      reply.send(courseCases)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch course cases')
    }
  })

  // GET /course-cases/course/:courseId - Get cases by course
  fastify.get('/course-cases/course/:courseId', async (request, reply) => {
    try {
      const { courseId } = courseCaseCourseParamsSchema.parse(request.params)
      const { userId, isAdmin } = resolveViewerFromRequest(request)
      const visibilityWhere = await courseCaseVisibilityFilter(fastify.prisma, userId, isAdmin)

      const course = await fastify.prisma.course.findUnique({ where: { id: courseId } })
      if (!course) {
        reply.status(404).send({ error: 'Course not found' })
        return
      }

      const courseCases = await fastify.prisma.courseCase.findMany({
        where: { AND: [{ courseId }, visibilityWhere] },
        include: courseCaseService.getStandardInclude(),
        orderBy: { displayOrder: 'asc' }
      })
      reply.send(courseCases)
    } catch (error) {
      if (error instanceof Error && error.message === 'Course not found') {
        reply.status(404).send({ error: 'Course not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /course-cases/course/:courseId/paginated - Get paginated cases with filtering and search
  fastify.get('/course-cases/course/:courseId/paginated', async (request, reply) => {
    try {
      const { courseId } = courseCaseCourseParamsSchema.parse(request.params)
      const queryParams = paginatedCourseCasesQuerySchema.parse(request.query)

      const result = await courseCaseService.findByCoursePaginated(courseId, {
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
      if (error instanceof Error && error.message === 'Course not found') {
        reply.status(404).send({ error: 'Course not found' })
      } else if (error instanceof z.ZodError) {
        reply.status(400).send({ error: 'Invalid query parameters', details: error.errors })
      } else {
        replyInternalError(request, reply, error, 'Failed to fetch paginated course cases')
      }
    }
  })

  // GET /course-cases/course/:courseId/free
  fastify.get('/course-cases/course/:courseId/free', async (request, reply) => {
    try {
      const { courseId } = courseCaseCourseParamsSchema.parse(request.params)
      const courseCases = await courseCaseService.findFreeCases(courseId)
      reply.send(courseCases)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /course-cases/course/:courseId/paid
  fastify.get('/course-cases/course/:courseId/paid', async (request, reply) => {
    try {
      const { courseId } = courseCaseCourseParamsSchema.parse(request.params)
      const courseCases = await courseCaseService.findPaidCases(courseId)
      reply.send(courseCases)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /course-cases/course/:courseId/gender/:gender
  fastify.get('/course-cases/course/:courseId/gender/:gender', async (request, reply) => {
    try {
      const { courseId, gender } = genderParamsSchema.parse(request.params)
      const courseCases = await courseCaseService.findByGender(courseId, gender)
      reply.send(courseCases)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /course-cases/course/:courseId/stats
  fastify.get('/course-cases/course/:courseId/stats', async (request, reply) => {
    try {
      const { courseId } = courseCaseCourseParamsSchema.parse(request.params)
      const stats = await courseCaseService.getCaseStats(courseId)
      reply.send(stats)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /course-cases/course/:courseId/age-range
  fastify.get('/course-cases/course/:courseId/age-range', async (request, reply) => {
    try {
      const { courseId } = courseCaseCourseParamsSchema.parse(request.params)
      const ageRange = await courseCaseService.getAgeRange(courseId)
      reply.send(ageRange)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /exams/:examSlug/courses/:courseSlug/cases/:caseSlug - Get case by slugs (clean URL)
  fastify.get('/exams/:examSlug/courses/:courseSlug/cases/:caseSlug', async (request, reply) => {
    try {
      const { examSlug, courseSlug, caseSlug } = request.params as {
        examSlug: string
        courseSlug: string
        caseSlug: string
      }
      const slugLookup = await courseCaseService.findBySlug(examSlug, courseSlug, caseSlug)
      const { userId, isAdmin } = resolveViewerFromRequest(request)
      const courseCase = await courseCaseService.findByIdVisibleTo(slugLookup.id, userId, isAdmin)
      if (!courseCase) {
        reply.status(404).send({ error: 'Course case not found' })
        return
      }
      reply.send(courseCase)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Exam not found') {
          reply.status(404).send({ error: 'Exam not found' })
        } else if (error.message === 'Course not found') {
          reply.status(404).send({ error: 'Course not found' })
        } else if (error.message === 'Course case not found') {
          reply.status(404).send({ error: 'Course case not found' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /course-cases/:id
  fastify.get('/course-cases/:id', async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      const { userId, isAdmin } = resolveViewerFromRequest(request)
      const courseCase = await courseCaseService.findByIdVisibleTo(id, userId, isAdmin)
      if (!courseCase) {
        reply.status(404).send({ error: 'Course case not found' })
        return
      }
      reply.send(courseCase)
    } catch (error) {
      if (error instanceof Error && error.message === 'Course case not found') {
        reply.status(404).send({ error: 'Course case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /course-cases - Create new course case
  fastify.post('/course-cases', {
    preHandler: requirePermission('case.create', (req) => {
      const body = createCourseCaseSchema.parse(req.body)
      return { kind: 'course', id: body.courseId }
    })
  }, async (request, reply) => {
    try {
      const data = createCourseCaseSchema.parse(request.body)
      const courseCase = await courseCaseService.create(data)
      reply.status(201).send(courseCase)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course not found') {
          reply.status(404).send({ error: 'Course not found' })
        } else if (error.message === 'Cases can only be added to RANDOM style courses') {
          reply.status(400).send({ error: 'Cases can only be added to RANDOM style courses' })
        } else if (error.message.includes('Display order') && error.message.includes('already taken')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to create course case')
      }
    }
  })

  // PUT /course-cases/:id - Update course case
  fastify.put('/course-cases/:id', {
    preHandler: requirePermission('case.edit', (req) => {
      const { id } = courseCaseParamsSchema.parse(req.params)
      return { kind: 'course_case', id }
    })
  }, async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      const data = updateCourseCaseSchema.parse(request.body)
      const courseCase = await courseCaseService.update(id, data)
      reply.send(courseCase)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course case not found') {
          reply.status(404).send({ error: 'Course case not found' })
        } else if (error.message.includes('Display order') && error.message.includes('already taken')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to update course case')
      }
    }
  })

  // PATCH /course-cases/:id/toggle-free
  fastify.patch('/course-cases/:id/toggle-free', {
    preHandler: requirePermission('case.edit', (req) => {
      const { id } = courseCaseParamsSchema.parse(req.params)
      return { kind: 'course_case', id }
    })
  }, async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      const courseCase = await courseCaseService.toggleFree(id)
      reply.send({
        message: `Case ${courseCase.isFree ? 'marked as free' : 'marked as paid'} successfully`,
        courseCase
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Course case not found') {
        reply.status(404).send({ error: 'Course case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // PATCH /course-cases/:id/reorder
  fastify.patch('/course-cases/:id/reorder', {
    preHandler: requirePermission('case.edit', (req) => {
      const { id } = courseCaseParamsSchema.parse(req.params)
      return { kind: 'course_case', id }
    })
  }, async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      const { newOrder } = reorderCourseCaseSchema.parse(request.body)
      const courseCase = await courseCaseService.reorder(id, newOrder)
      reply.send({
        message: `Case reordered to position ${newOrder} successfully`,
        courseCase
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course case not found') {
          reply.status(404).send({ error: 'Course case not found' })
        } else if (error.message.includes('Display order') && error.message.includes('already taken')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to reorder course case')
      }
    }
  })

  // DELETE /course-cases/:id
  fastify.delete('/course-cases/:id', {
    preHandler: requirePermission('case.delete', (req) => {
      const { id } = courseCaseParamsSchema.parse(req.params)
      return { kind: 'course_case', id }
    })
  }, async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      await courseCaseService.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Course case not found') {
        reply.status(404).send({ error: 'Course case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /course-cases/course/:courseId/filtered
  fastify.get('/course-cases/course/:courseId/filtered', async (request, reply) => {
    try {
      const { courseId } = courseParamsSchema.parse(request.params)
      const filters = filterQuerySchema.parse(request.query)
      
      const courseCases = await courseCaseService.findByFilters(courseId, {
        specialtyIds: filters.specialtyIds,
        curriculumIds: filters.curriculumIds,
        isFree: filters.isFree,
        patientGender: filters.patientGender
      })
      
      reply.send(courseCases)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid filter parameters' })
    }
  })

  // GET /course-cases/:courseCaseId/specialties
  fastify.get('/course-cases/:courseCaseId/specialties', async (request, reply) => {
    try {
      const { courseCaseId } = junctionCourseCaseParamsSchema.parse(request.params)
      const specialties = await courseCaseService.getCaseSpecialties(courseCaseId)
      reply.send(specialties)
    } catch (error) {
      if (error instanceof Error && error.message === 'Course case not found') {
        reply.status(404).send({ error: 'Course case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /course-cases/:courseCaseId/curriculums
  fastify.get('/course-cases/:courseCaseId/curriculums', async (request, reply) => {
    try {
      const { courseCaseId } = junctionCourseCaseParamsSchema.parse(request.params)
      const curriculums = await courseCaseService.getCaseCurriculums(courseCaseId)
      reply.send(curriculums)
    } catch (error) {
      if (error instanceof Error && error.message === 'Course case not found') {
        reply.status(404).send({ error: 'Course case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // PATCH /course-cases/:id/publish - Set draft/published state
  fastify.patch('/course-cases/:id/publish', {
    preHandler: requirePermission('case.publish', (req) => {
      const { id } = courseCaseParamsSchema.parse(req.params)
      return { kind: 'course_case', id }
    })
  }, async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      const { isPublished } = z.object({ isPublished: z.boolean() }).parse(request.body)
      const courseCase = await courseCaseService.setPublished(id, isPublished)
      reply.send({
        message: `Case ${courseCase.isPublished ? 'published' : 'unpublished'} successfully`,
        courseCase
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Course case not found') {
        reply.status(404).send({ error: 'Course case not found' })
      } else if (error instanceof z.ZodError) {
        reply.status(400).send({ error: 'Invalid request', details: error.errors })
      } else {
        replyInternalError(request, reply, error, 'Failed to update publish state')
      }
    }
  })

  // POST /course-cases/assign-specialties
  fastify.post('/course-cases/assign-specialties', {
    preHandler: requirePermission('case.edit', (req) => {
      const { courseCaseId } = assignSpecialtiesSchema.parse(req.body)
      return { kind: 'course_case', id: courseCaseId }
    })
  }, async (request, reply) => {
    try {
      const { courseCaseId, specialtyIds } = assignSpecialtiesSchema.parse(request.body)
      const result = await courseCaseService.assignSpecialties(courseCaseId, specialtyIds)
      reply.send({
        message: 'Specialties assigned successfully',
        assignments: result,
        courseCaseId,
        specialtiesCount: specialtyIds.length
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course case not found') {
          reply.status(404).send({ error: 'Course case not found' })
        } else if (error.message === 'One or more specialties not found') {
          reply.status(404).send({ error: 'One or more specialties not found' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to assign specialties to course case')
      }
    }
  })

  // POST /course-cases/assign-curriculums
  fastify.post('/course-cases/assign-curriculums', {
    preHandler: requirePermission('case.edit', (req) => {
      const { courseCaseId } = assignCurriculumsSchema.parse(req.body)
      return { kind: 'course_case', id: courseCaseId }
    })
  }, async (request, reply) => {
    try {
      const { courseCaseId, curriculumIds } = assignCurriculumsSchema.parse(request.body)
      const result = await courseCaseService.assignCurriculums(courseCaseId, curriculumIds)
      reply.send({
        message: 'Curriculum items assigned successfully',
        assignments: result,
        courseCaseId,
        curriculumsCount: curriculumIds.length
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course case not found') {
          reply.status(404).send({ error: 'Course case not found' })
        } else if (error.message === 'One or more curriculum items not found') {
          reply.status(404).send({ error: 'One or more curriculum items not found' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to assign curriculums to course case')
      }
    }
  })

  // POST /course-cases/bulk-assign-filters
  fastify.post('/course-cases/bulk-assign-filters', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { assignments } = bulkAssignFiltersSchema.parse(request.body)

      // Per-item permission check (preHandler can't cover variable-length payloads)
      if (!isAdmin(request)) {
        const userId = request.user?.userId
        if (!userId) {
          reply.status(401).send({ error: 'Unauthorized' })
          return
        }
        for (const assignment of assignments) {
          const allowed = await userHasPermission(fastify.prisma, {
            userId,
            isAdmin: false,
            permission: 'case.edit',
            target: { kind: 'course_case', id: assignment.courseCaseId },
          })
          if (!allowed) {
            reply.status(403).send({ error: 'Forbidden' })
            return
          }
        }
      }

      const result = await courseCaseService.bulkAssignFilters(assignments)
      reply.send({
        message: 'Bulk assignment completed successfully',
        result,
        processedCases: assignments.length
      })
    } catch (error) {
      if (error instanceof Error) {
        reply.status(400).send({ error: error.message })
      } else {
        replyInternalError(request, reply, error, 'Failed to bulk assign filters')
      }
    }
  })

  // DELETE /course-cases/:courseCaseId/specialties/:specialtyId
  fastify.delete('/course-cases/:courseCaseId/specialties/:specialtyId', {
    preHandler: requirePermission('case.edit', (req) => {
      const { courseCaseId } = specialtyRemoveParamsSchema.parse(req.params)
      return { kind: 'course_case', id: courseCaseId }
    })
  }, async (request, reply) => {
    try {
      const { courseCaseId, specialtyId } = specialtyRemoveParamsSchema.parse(request.params)
      const result = await courseCaseService.removeSpecialty(courseCaseId, specialtyId)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course case not found') {
          reply.status(404).send({ error: 'Course case not found' })
        } else if (error.message === 'Specialty assignment not found') {
          reply.status(404).send({ error: 'Specialty assignment not found' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to remove specialty from course case')
      }
    }
  })

  // DELETE /course-cases/:courseCaseId/curriculums/:curriculumId
  fastify.delete('/course-cases/:courseCaseId/curriculums/:curriculumId', {
    preHandler: requirePermission('case.edit', (req) => {
      const { courseCaseId } = curriculumRemoveParamsSchema.parse(req.params)
      return { kind: 'course_case', id: courseCaseId }
    })
  }, async (request, reply) => {
    try {
      const { courseCaseId, curriculumId } = curriculumRemoveParamsSchema.parse(request.params)
      const result = await courseCaseService.removeCurriculum(courseCaseId, curriculumId)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course case not found') {
          reply.status(404).send({ error: 'Course case not found' })
        } else if (error.message === 'Curriculum assignment not found') {
          reply.status(404).send({ error: 'Curriculum assignment not found' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to remove curriculum from course case')
      }
    }
  })

  // GET /course-cases/course/:courseId/filtering-stats
  fastify.get('/course-cases/course/:courseId/filtering-stats', async (request, reply) => {
    try {
      const { courseId } = courseParamsSchema.parse(request.params)
      const stats = await courseCaseService.getFilteringStats(courseId)
      reply.send(stats)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /course-cases/course/:courseId/available-filters
  fastify.get('/course-cases/course/:courseId/available-filters', async (request, reply) => {
    try {
      const { courseId } = courseParamsSchema.parse(request.params)
      
      const courseCases = await courseCaseService.findByCourse(courseId)
      
      const uniqueSpecialties = new Set()
      const uniqueCurriculums = new Set()
      const availableGenders = new Set()
      
      courseCases.forEach((courseCase: any) => {
        availableGenders.add(courseCase.patientGender)
        
        if (courseCase.caseSpecialties) {
          courseCase.caseSpecialties.forEach((cs: any) => {
            uniqueSpecialties.add(JSON.stringify({
              id: cs.specialty.id,
              name: cs.specialty.name
            }))
          })
        }
        
        if (courseCase.caseCurriculums) {
          courseCase.caseCurriculums.forEach((cc: any) => {
            uniqueCurriculums.add(JSON.stringify({
              id: cc.curriculum.id,
              name: cc.curriculum.name
            }))
          })
        }
      })
      
      reply.send({
        courseId,
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

  // POST /course-cases/create-complete
  fastify.post('/course-cases/create-complete', {
    preHandler: requirePermission('case.create', (req) => {
      const body = createCompleteCourseCaseSchema.parse(req.body)
      return { kind: 'course', id: body.courseCase.courseId }
    })
  }, async (request, reply) => {
    try {
      const data = createCompleteCourseCaseSchema.parse(request.body)
      const result = await courseCaseService.createCompleteCourseCase(data)
      reply.status(201).send({
        message: 'Course case created and configured successfully',
        ...result
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course not found') {
          reply.status(404).send({ error: 'Course not found' })
        } else if (error.message === 'Cases can only be added to RANDOM style courses') {
          reply.status(400).send({ error: 'Cases can only be added to RANDOM style courses' })
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
        replyInternalError(request, reply, error, 'Failed to create complete course case')
      }
    }
  })

  // PUT /course-cases/update-complete
  fastify.put('/course-cases/update-complete', {
    preHandler: requirePermission('case.edit', (req) => {
      const body = updateCompleteCourseCaseSchema.parse(req.body)
      return { kind: 'course_case', id: body.courseCaseId }
    })
  }, async (request, reply) => {
    try {
      const data = updateCompleteCourseCaseSchema.parse(request.body)
      const result = await courseCaseService.updateCompleteCourseCase(data)
      reply.send({
        message: 'Course case updated successfully',
        ...result
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course case not found') {
          reply.status(404).send({ error: 'Course case not found' })
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
        replyInternalError(request, reply, error, 'Failed to update complete course case')
      }
    }
  })

  // GET /course-cases/:id/complete
  fastify.get('/course-cases/:id/complete', async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      const { userId, isAdmin } = resolveViewerFromRequest(request)
      const courseCase = await courseCaseService.findByIdVisibleTo(id, userId, isAdmin)

      if (!courseCase) {
        reply.status(404).send({ error: 'Course case not found' })
        return
      }

      const tabsResponse: any = {}
      for (const tab of courseCase.caseTabs) {
        tabsResponse[tab.tabType] = {
          id: tab.id,
          content: tab.content,
          hasContent: tab.content.length > 0
        }
      }
      
      const markingCriteriaGrouped = courseCase.markingCriteria.reduce((acc, criterion) => {
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
      
      const specialties = courseCase.caseSpecialties.map((cs: any) => cs.specialty)
      const curriculums = courseCase.caseCurriculums.map((cc: any) => cc.curriculum)
      
      reply.send({
        courseCase: {
          id: courseCase.id,
          courseId: courseCase.courseId,
          title: courseCase.title,
          diagnosis: courseCase.diagnosis,
          patientName: courseCase.patientName,
          patientAge: courseCase.patientAge,
          patientGender: courseCase.patientGender,
          description: courseCase.description,
          isFree: courseCase.isFree,
          displayOrder: courseCase.displayOrder,
          createdAt: courseCase.createdAt,
          updatedAt: courseCase.updatedAt
        },
        tabs: tabsResponse,
        markingCriteria: markingCriteriaGrouped,
        specialties,
        curriculums,
        simulation: courseCase.simulation,
        course: courseCase.course
      })
    } catch (error) {
      request.log.error({ err: error }, 'Error fetching complete course case')
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /exams/:examSlug/courses/:courseSlug/cases/:caseSlug/complete - Get complete case data by slugs (clean URL)
  fastify.get('/exams/:examSlug/courses/:courseSlug/cases/:caseSlug/complete', async (request, reply) => {
    try {
      const { examSlug, courseSlug, caseSlug } = request.params as {
        examSlug: string
        courseSlug: string
        caseSlug: string
      }

      // Use findBySlug to get the case first
      const caseLookup = await courseCaseService.findBySlug(examSlug, courseSlug, caseSlug)
      const id = caseLookup.id

      const { userId, isAdmin } = resolveViewerFromRequest(request)
      const courseCase = await courseCaseService.findByIdVisibleTo(id, userId, isAdmin)

      if (!courseCase) {
        reply.status(404).send({ error: 'Course case not found' })
        return
      }

      const tabsResponse: any = {}
      for (const tab of courseCase.caseTabs) {
        tabsResponse[tab.tabType] = {
          id: tab.id,
          content: tab.content,
          hasContent: tab.content.length > 0
        }
      }

      const markingCriteriaGrouped = courseCase.markingCriteria.reduce((acc, criterion) => {
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

      const specialties = courseCase.caseSpecialties.map((cs: any) => cs.specialty)
      const curriculums = courseCase.caseCurriculums.map((cc: any) => cc.curriculum)

      reply.send({
        courseCase: {
          id: courseCase.id,
          courseId: courseCase.courseId,
          slug: courseCase.slug,
          title: courseCase.title,
          diagnosis: courseCase.diagnosis,
          patientName: courseCase.patientName,
          patientAge: courseCase.patientAge,
          patientGender: courseCase.patientGender,
          description: courseCase.description,
          isFree: courseCase.isFree,
          displayOrder: courseCase.displayOrder,
          createdAt: courseCase.createdAt,
          updatedAt: courseCase.updatedAt
        },
        tabs: tabsResponse,
        markingCriteria: markingCriteriaGrouped,
        specialties,
        curriculums,
        simulation: courseCase.simulation,
        course: courseCase.course
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Exam not found') {
          reply.status(404).send({ error: 'Exam not found' })
        } else if (error.message === 'Course not found') {
          reply.status(404).send({ error: 'Course not found' })
        } else if (error.message === 'Course case not found') {
          reply.status(404).send({ error: 'Course case not found' })
        } else {
          request.log.error({ err: error }, 'Error fetching complete course case by slug')
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        request.log.error({ err: error }, 'Error fetching complete course case by slug')
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}