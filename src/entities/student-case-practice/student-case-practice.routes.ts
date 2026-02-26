import { FastifyInstance } from 'fastify'
import { StudentCasePracticeService } from './student-case-practice.service'
import {
  toggleBookmarkSchema,
  getStudentStatusForCourseSchema
} from './student-case-practice.schema'
import { z } from 'zod'
import { replyInternalError } from '../../shared/route-error'

export default async function studentCasePracticeRoutes(fastify: FastifyInstance) {
  const studentCasePracticeService = new StudentCasePracticeService(fastify.prisma)

  // POST /student-case-practice/bookmark - Toggle bookmark status
  fastify.post('/student-case-practice/bookmark', async (request, reply) => {
    try {
      const data = toggleBookmarkSchema.parse(request.body)
      const result = await studentCasePracticeService.toggleBookmark(
        data.studentId,
        data.courseCaseId,
        data.isBookmarked
      )
      reply.send(result)
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          error: 'Validation error',
          details: error.errors
        })
      } else if (error instanceof Error) {
        if (error.message === 'Student not found' || error.message === 'Course case not found') {
          reply.status(404).send({ error: error.message })
        } else {
          replyInternalError(request, reply, error, 'Failed to toggle bookmark')
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to toggle bookmark')
      }
    }
  })

  // GET /student-case-practice/student/:studentId/case/:courseCaseId - Get status for specific case
  fastify.get('/student-case-practice/student/:studentId/case/:courseCaseId', async (request, reply) => {
    try {
      const { studentId, courseCaseId } = request.params as { studentId: string; courseCaseId: string }
      const result = await studentCasePracticeService.getStudentStatus(studentId, courseCaseId)
      reply.send(result)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch student case status')
    }
  })

  // GET /student-case-practice/student/:studentId/course/:courseId - Get all statuses for a course
  fastify.get('/student-case-practice/student/:studentId/course/:courseId', async (request, reply) => {
    try {
      const { studentId, courseId } = request.params as { studentId: string; courseId: string }
      const result = await studentCasePracticeService.getStudentStatusesForCourse(studentId, courseId)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Student not found' || error.message === 'Course not found') {
          reply.status(404).send({ error: error.message })
        } else {
          replyInternalError(request, reply, error, 'Failed to fetch student course statuses')
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to fetch student course statuses')
      }
    }
  })

  // GET /student-case-practice/student/:studentId/bookmarks - Get all bookmarked cases
  fastify.get('/student-case-practice/student/:studentId/bookmarks', async (request, reply) => {
    try {
      const { studentId } = request.params as { studentId: string }
      const { courseId } = request.query as { courseId?: string }
      const result = await studentCasePracticeService.getBookmarkedCases(studentId, courseId)
      reply.send(result)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch bookmarked cases')
    }
  })

  // GET /student-case-practice/student/:studentId/stats - Get practice statistics
  fastify.get('/student-case-practice/student/:studentId/stats', async (request, reply) => {
    try {
      const { studentId } = request.params as { studentId: string }
      const { courseId } = request.query as { courseId?: string }
      const result = await studentCasePracticeService.getPracticeStats(studentId, courseId)
      reply.send(result)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch practice stats')
    }
  })
}
