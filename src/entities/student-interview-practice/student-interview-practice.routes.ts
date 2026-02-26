import { FastifyInstance } from 'fastify'
import { StudentInterviewPracticeService } from './student-interview-practice.service'
import {
  toggleBookmarkSchema,
  getStudentStatusForCourseSchema
} from './student-interview-practice.schema'
import { z } from 'zod'
import { replyInternalError } from '../../shared/route-error'

export default async function studentInterviewPracticeRoutes(fastify: FastifyInstance) {
  const studentInterviewPracticeService = new StudentInterviewPracticeService(fastify.prisma)

  // POST /student-interview-practice/bookmark - Toggle bookmark status
  fastify.post('/student-interview-practice/bookmark', async (request, reply) => {
    try {
      const data = toggleBookmarkSchema.parse(request.body)
      const result = await studentInterviewPracticeService.toggleBookmark(
        data.studentId,
        data.interviewCaseId,
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
        if (error.message === 'Student not found' || error.message === 'Interview case not found') {
          reply.status(404).send({ error: error.message })
        } else {
          replyInternalError(request, reply, error, 'Failed to toggle bookmark')
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to toggle bookmark')
      }
    }
  })

  // GET /student-interview-practice/student/:studentId/case/:interviewCaseId - Get status for specific case
  fastify.get('/student-interview-practice/student/:studentId/case/:interviewCaseId', async (request, reply) => {
    try {
      const { studentId, interviewCaseId } = request.params as { studentId: string; interviewCaseId: string }
      const result = await studentInterviewPracticeService.getStudentStatus(studentId, interviewCaseId)
      reply.send(result)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch student interview case status')
    }
  })

  // GET /student-interview-practice/student/:studentId/course/:interviewCourseId - Get all statuses for a course
  fastify.get('/student-interview-practice/student/:studentId/course/:interviewCourseId', async (request, reply) => {
    try {
      const { studentId, interviewCourseId } = request.params as { studentId: string; interviewCourseId: string }
      const result = await studentInterviewPracticeService.getStudentStatusesForCourse(studentId, interviewCourseId)
      reply.send(result)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Student not found' || error.message === 'Interview course not found') {
          reply.status(404).send({ error: error.message })
        } else {
          replyInternalError(request, reply, error, 'Failed to fetch student interview course statuses')
        }
      } else {
        replyInternalError(request, reply, error, 'Failed to fetch student interview course statuses')
      }
    }
  })

  // GET /student-interview-practice/student/:studentId/bookmarks - Get all bookmarked cases
  fastify.get('/student-interview-practice/student/:studentId/bookmarks', async (request, reply) => {
    try {
      const { studentId } = request.params as { studentId: string }
      const { interviewCourseId } = request.query as { interviewCourseId?: string }
      const result = await studentInterviewPracticeService.getBookmarkedCases(studentId, interviewCourseId)
      reply.send(result)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch bookmarked interview cases')
    }
  })

  // GET /student-interview-practice/student/:studentId/stats - Get practice statistics
  fastify.get('/student-interview-practice/student/:studentId/stats', async (request, reply) => {
    try {
      const { studentId } = request.params as { studentId: string }
      const { interviewCourseId } = request.query as { interviewCourseId?: string }
      const result = await studentInterviewPracticeService.getPracticeStats(studentId, interviewCourseId)
      reply.send(result)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch interview practice stats')
    }
  })
}
