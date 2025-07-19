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
  createCompleteCourseCaseSchema,  // NEW
  updateCompleteCourseCaseSchema   // NEW
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

// Additional schemas for query parameters
const genderParamsSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  gender: PatientGenderEnum
})

export default async function courseCaseRoutes(fastify: FastifyInstance) {
  const courseCaseService = new CourseCaseService(fastify.prisma)

  // GET /course-cases - Get all course cases
  fastify.get('/course-cases', async (request, reply) => {
    try {
      const courseCases = await courseCaseService.findAll()
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

  // GET /course-cases/course/:courseId/free - Get free cases by course
  fastify.get('/course-cases/course/:courseId/free', async (request, reply) => {
    try {
      const { courseId } = courseCaseCourseParamsSchema.parse(request.params)
      const courseCases = await courseCaseService.findFreeCases(courseId)
      reply.send(courseCases)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /course-cases/course/:courseId/paid - Get paid cases by course
  fastify.get('/course-cases/course/:courseId/paid', async (request, reply) => {
    try {
      const { courseId } = courseCaseCourseParamsSchema.parse(request.params)
      const courseCases = await courseCaseService.findPaidCases(courseId)
      reply.send(courseCases)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /course-cases/course/:courseId/gender/:gender - Get cases by patient gender
  fastify.get('/course-cases/course/:courseId/gender/:gender', async (request, reply) => {
    try {
      const { courseId, gender } = genderParamsSchema.parse(request.params)
      const courseCases = await courseCaseService.findByGender(courseId, gender)
      reply.send(courseCases)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /course-cases/course/:courseId/stats - Get course case statistics
  fastify.get('/course-cases/course/:courseId/stats', async (request, reply) => {
    try {
      const { courseId } = courseCaseCourseParamsSchema.parse(request.params)
      const stats = await courseCaseService.getCaseStats(courseId)
      reply.send(stats)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /course-cases/course/:courseId/age-range - Get age range statistics
  fastify.get('/course-cases/course/:courseId/age-range', async (request, reply) => {
    try {
      const { courseId } = courseCaseCourseParamsSchema.parse(request.params)
      const ageRange = await courseCaseService.getAgeRange(courseId)
      reply.send(ageRange)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /course-cases/:id - Get course case by ID
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
  fastify.post('/course-cases', async (request, reply) => {
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /course-cases/:id - Update course case
  fastify.put('/course-cases/:id', async (request, reply) => {
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PATCH /course-cases/:id/toggle-free - Toggle case free status
  fastify.patch('/course-cases/:id/toggle-free', async (request, reply) => {
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

  // PATCH /course-cases/:id/reorder - Reorder course case
  fastify.patch('/course-cases/:id/reorder', async (request, reply) => {
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // DELETE /course-cases/:id - Delete course case
  fastify.delete('/course-cases/:id', async (request, reply) => {
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

  // GET /course-cases/course/:courseId/filtered - Get filtered cases
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

  // GET /course-cases/:courseCaseId/specialties - Get case specialties
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

  // GET /course-cases/:courseCaseId/curriculums - Get case curriculum items
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

  // POST /course-cases/assign-specialties - Assign specialties to case
  fastify.post('/course-cases/assign-specialties', async (request, reply) => {
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /course-cases/assign-curriculums - Assign curriculum items to case
  fastify.post('/course-cases/assign-curriculums', async (request, reply) => {
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /course-cases/bulk-assign-filters - Bulk assign filters to multiple cases
  fastify.post('/course-cases/bulk-assign-filters', async (request, reply) => {
    try {
      const { assignments } = bulkAssignFiltersSchema.parse(request.body)
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

  // DELETE /course-cases/:courseCaseId/specialties/:specialtyId - Remove specialty
  fastify.delete('/course-cases/:courseCaseId/specialties/:specialtyId', async (request, reply) => {
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // DELETE /course-cases/:courseCaseId/curriculums/:curriculumId - Remove curriculum
  fastify.delete('/course-cases/:courseCaseId/curriculums/:curriculumId', async (request, reply) => {
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // GET /course-cases/course/:courseId/filtering-stats - Get filtering statistics
  fastify.get('/course-cases/course/:courseId/filtering-stats', async (request, reply) => {
    try {
      const { courseId } = courseParamsSchema.parse(request.params)
      const stats = await courseCaseService.getFilteringStats(courseId)
      reply.send(stats)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // Helper endpoint for available filters
  fastify.get('/course-cases/course/:courseId/available-filters', async (request, reply) => {
    try {
      const { courseId } = courseParamsSchema.parse(request.params)
      
      // Get all specialties and curriculums used in this course
      const courseCases = await courseCaseService.findByCourse(courseId)
      
      const uniqueSpecialties = new Set()
      const uniqueCurriculums = new Set()
      const availableGenders = new Set()
      
      courseCases.forEach((courseCase: any) => {
        // Add patient gender
        availableGenders.add(courseCase.patientGender)
        
        // Add specialties
        if (courseCase.caseSpecialties) {
          courseCase.caseSpecialties.forEach((cs: any) => {
            uniqueSpecialties.add(JSON.stringify({
              id: cs.specialty.id,
              name: cs.specialty.name
            }))
          })
        }
        
        // Add curriculums
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

  // ===== NEW COMPLETE COURSE CASE ROUTES =====

  // POST /course-cases/create-complete - Create course case with all relations
  fastify.post('/course-cases/create-complete', async (request, reply) => {
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /course-cases/update-complete - Update course case with all relations
  fastify.put('/course-cases/update-complete', async (request, reply) => {
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
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // GET /course-cases/:id/complete - Get course case with all relations
  fastify.get('/course-cases/:id/complete', async (request, reply) => {
    try {
      const { id } = courseCaseParamsSchema.parse(request.params)
      
      // Fetch course case with all relations
      const courseCase = await courseCaseService.findById(id)
      
      // Get all tabs
      const tabs = await fastify.prisma.caseTab.findMany({
        where: { courseCaseId: id }
      })
      
      // Get specialties
      const specialties = await courseCaseService.getCaseSpecialties(id)
      
      // Get curriculums
      const curriculums = await courseCaseService.getCaseCurriculums(id)
      
      // Get simulation
      const simulation = await fastify.prisma.simulation.findUnique({
        where: { courseCaseId: id }
      })
      
      // Format response
      const tabsResponse: any = {}
      for (const tab of tabs) {
        tabsResponse[tab.tabType] = {
          id: tab.id,
          content: tab.content,
          hasContent: tab.content.trim().length > 0
        }
      }
      
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
          displayOrder: courseCase.displayOrder
        },
        tabs: tabsResponse,
        specialties,
        curriculums,
        simulation,
        course: courseCase.course
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Course case not found') {
        reply.status(404).send({ error: 'Course case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}