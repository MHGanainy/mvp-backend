// src/entities/course-case/course-case.routes.ts
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CourseCaseService } from './course-case.service'
import { CourseService } from '../course/course.service'
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
import { authenticate, getCurrentInstructorId, isAdmin } from '../../middleware/auth.middleware'

const genderParamsSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  gender: PatientGenderEnum
})

export default async function courseCaseRoutes(fastify: FastifyInstance) {
  const courseCaseService = new CourseCaseService(fastify.prisma)
  const courseService = new CourseService(fastify.prisma)

  // GET /course-cases - Get course cases based on user role
  fastify.get('/course-cases', async (request, reply) => {
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
      
      let courseCases
      if (isUserAdmin) {
        // Admin sees ALL cases
        courseCases = await courseCaseService.findAll()
      } else if (currentInstructorId) {
        // Instructor sees cases from their courses
        const instructorCourses = await courseService.findByInstructor(currentInstructorId)
        const courseIds = instructorCourses.map(c => c.id)
        courseCases = await fastify.prisma.courseCase.findMany({
          where: { courseId: { in: courseIds } },
          include: courseCaseService.getStandardInclude(),
          orderBy: [
            { courseId: 'asc' },
            { displayOrder: 'asc' }
          ]
        })
      } else {
        // Public sees only free cases from published courses
        const publishedCourses = await courseService.findPublished()
        const courseIds = publishedCourses.map(c => c.id)
        courseCases = await fastify.prisma.courseCase.findMany({
          where: { 
            courseId: { in: courseIds },
            isFree: true 
          },
          include: courseCaseService.getStandardInclude(),
          orderBy: [
            { courseId: 'asc' },
            { displayOrder: 'asc' }
          ]
        })
      }
      
      reply.send(courseCases)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch course cases' })
    }
  })

  // GET /course-cases/course/:courseId - Get cases by course
  fastify.get('/course-cases/course/:courseId', async (request, reply) => {
    try {
      const { courseId } = courseCaseCourseParamsSchema.parse(request.params)
      const courseCases = await courseCaseService.findByCourse(courseId)
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
        search: queryParams.search
      })

      reply.send(result)
    } catch (error) {
      if (error instanceof Error && error.message === 'Course not found') {
        reply.status(404).send({ error: 'Course not found' })
      } else if (error instanceof z.ZodError) {
        reply.status(400).send({ error: 'Invalid query parameters', details: error.errors })
      } else {
        reply.status(500).send({ error: 'Failed to fetch paginated course cases' })
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
      const courseCase = await courseCaseService.findBySlug(examSlug, courseSlug, caseSlug)
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
      const courseCase = await courseCaseService.findById(id)
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
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createCourseCaseSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const course = await courseService.findById(data.courseId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only create cases for your own courses' })
          return
        }
      }
      
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /course-cases/:id - Update course case
  fastify.put('/course-cases/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      const data = updateCourseCaseSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const courseCase = await courseCaseService.findById(id)
        const course = await courseService.findById(courseCase.courseId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only edit cases for your own courses' })
          return
        }
      }
      
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PATCH /course-cases/:id/toggle-free
  fastify.patch('/course-cases/:id/toggle-free', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      
      if (!isAdmin(request)) {
        const courseCase = await courseCaseService.findById(id)
        const course = await courseService.findById(courseCase.courseId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify cases for your own courses' })
          return
        }
      }
      
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
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      const { newOrder } = reorderCourseCaseSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const courseCase = await courseCaseService.findById(id)
        const course = await courseService.findById(courseCase.courseId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only reorder cases for your own courses' })
          return
        }
      }
      
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // DELETE /course-cases/:id
  fastify.delete('/course-cases/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      
      if (!isAdmin(request)) {
        const courseCase = await courseCaseService.findById(id)
        const course = await courseService.findById(courseCase.courseId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only delete cases from your own courses' })
          return
        }
      }
      
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

  // POST /course-cases/assign-specialties
  fastify.post('/course-cases/assign-specialties', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { courseCaseId, specialtyIds } = assignSpecialtiesSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const courseCase = await courseCaseService.findById(courseCaseId)
        const course = await courseService.findById(courseCase.courseId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify cases for your own courses' })
          return
        }
      }
      
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /course-cases/assign-curriculums
  fastify.post('/course-cases/assign-curriculums', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { courseCaseId, curriculumIds } = assignCurriculumsSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const courseCase = await courseCaseService.findById(courseCaseId)
        const course = await courseService.findById(courseCase.courseId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify cases for your own courses' })
          return
        }
      }
      
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /course-cases/bulk-assign-filters
  fastify.post('/course-cases/bulk-assign-filters', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { assignments } = bulkAssignFiltersSchema.parse(request.body)
      
      // Check permissions for each case
      if (!isAdmin(request)) {
        for (const assignment of assignments) {
          const courseCase = await courseCaseService.findById(assignment.courseCaseId)
          const course = await courseService.findById(courseCase.courseId)
          const currentInstructorId = getCurrentInstructorId(request)
          
          if (!currentInstructorId || course.instructorId !== currentInstructorId) {
            reply.status(403).send({ error: 'You can only modify cases for your own courses' })
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // DELETE /course-cases/:courseCaseId/specialties/:specialtyId
  fastify.delete('/course-cases/:courseCaseId/specialties/:specialtyId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { courseCaseId, specialtyId } = specialtyRemoveParamsSchema.parse(request.params)
      
      if (!isAdmin(request)) {
        const courseCase = await courseCaseService.findById(courseCaseId)
        const course = await courseService.findById(courseCase.courseId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify cases for your own courses' })
          return
        }
      }
      
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // DELETE /course-cases/:courseCaseId/curriculums/:curriculumId
  fastify.delete('/course-cases/:courseCaseId/curriculums/:curriculumId', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { courseCaseId, curriculumId } = curriculumRemoveParamsSchema.parse(request.params)
      
      if (!isAdmin(request)) {
        const courseCase = await courseCaseService.findById(courseCaseId)
        const course = await courseService.findById(courseCase.courseId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify cases for your own courses' })
          return
        }
      }
      
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
        reply.status(500).send({ error: 'Internal server error' })
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
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createCompleteCourseCaseSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const course = await courseService.findById(data.courseCase.courseId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only create cases for your own courses' })
          return
        }
      }
      
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /course-cases/update-complete
  fastify.put('/course-cases/update-complete', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = updateCompleteCourseCaseSchema.parse(request.body)
      
      if (!isAdmin(request)) {
        const courseCase = await courseCaseService.findById(data.courseCaseId)
        const course = await courseService.findById(courseCase.courseId)
        const currentInstructorId = getCurrentInstructorId(request)
        
        if (!currentInstructorId || course.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only update cases for your own courses' })
          return
        }
      }
      
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // GET /course-cases/:id/complete
  fastify.get('/course-cases/:id/complete', async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      
      const courseCase = await fastify.prisma.courseCase.findUnique({
        where: { id },
        include: {
          course: {
            include: {
              exam: {
                select: {
                  id: true,
                  title: true,
                  slug: true
                }
              }
            }
          },
          simulation: true,
          caseTabs: true,
          markingCriteria: {
            include: {
              markingDomain: true
            },
            orderBy: [
              { markingDomain: { name: 'asc' } },
              { displayOrder: 'asc' }
            ]
          },
          caseSpecialties: {
            include: {
              specialty: true
            }
          },
          caseCurriculums: {
            include: {
              curriculum: true
            }
          }
        }
      })
      
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
      console.error('Error fetching complete course case:', error)
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

      // Now get the complete data using the ID
      const courseCase = await fastify.prisma.courseCase.findUnique({
        where: { id },
        include: {
          course: {
            include: {
              exam: {
                select: {
                  id: true,
                  title: true,
                  slug: true
                }
              }
            }
          },
          simulation: true,
          caseTabs: true,
          markingCriteria: {
            include: {
              markingDomain: true
            },
            orderBy: [
              { markingDomain: { name: 'asc' } },
              { displayOrder: 'asc' }
            ]
          },
          caseSpecialties: {
            include: {
              specialty: true
            }
          },
          caseCurriculums: {
            include: {
              curriculum: true
            }
          }
        }
      })

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
          console.error('Error fetching complete course case by slug:', error)
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        console.error('Error fetching complete course case by slug:', error)
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}