// src/entities/interview-case-tab/interview-case-tab.routes.ts
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { InterviewCaseTabService } from './interview-case-tab.service'
import { InterviewCaseService } from '../interview-case/interview-case.service'
import { InterviewCourseService } from '../interview-course/interview-course.service'
import {
  createInterviewCaseTabSchema,
  updateInterviewCaseTabSchema,
  interviewCaseTabParamsSchema,
  interviewCaseTabInterviewCaseParamsSchema,
  interviewCaseTabTypeParamsSchema,
  interviewCourseParamsSchema,
  bulkUpdateInterviewCaseTabSchema,
  createAllTabsSchema
} from './interview-case-tab.schema'
import { authenticate, getCurrentInstructorId, isAdmin } from '../../middleware/auth.middleware'

export default async function interviewCaseTabRoutes(fastify: FastifyInstance) {
  const interviewCaseTabService = new InterviewCaseTabService(fastify.prisma)
  const interviewCaseService = new InterviewCaseService(fastify.prisma)
  const interviewCourseService = new InterviewCourseService(fastify.prisma)

  // GET /interview-case-tabs - Get all interview case tabs
  fastify.get('/interview-case-tabs', async (request, reply) => {
    try {
      const interviewCaseTabs = await interviewCaseTabService.findAll()
      reply.send(interviewCaseTabs)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch interview case tabs' })
    }
  })

  // GET /interview-case-tabs/interview-case/:interviewCaseId - Get all tabs for an interview case
  fastify.get('/interview-case-tabs/interview-case/:interviewCaseId', async (request, reply) => {
    try {
      const { interviewCaseId } = interviewCaseTabInterviewCaseParamsSchema.parse(request.params)
      const interviewCaseTabs = await interviewCaseTabService.findByInterviewCase(interviewCaseId)
      reply.send(interviewCaseTabs)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview case not found') {
        reply.status(404).send({ error: 'Interview case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interview-case-tabs/interview-case/:interviewCaseId/:tabType - Get specific tab for an interview case
  fastify.get('/interview-case-tabs/interview-case/:interviewCaseId/:tabType', async (request, reply) => {
    try {
      const { interviewCaseId, tabType } = interviewCaseTabTypeParamsSchema.parse(request.params)
      const interviewCaseTab = await interviewCaseTabService.findByTabType(interviewCaseId, tabType)
      reply.send(interviewCaseTab)
    } catch (error) {
      if (error instanceof Error && error.message.includes('tab not found')) {
        reply.status(404).send({ error: error.message })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interview-case-tabs/interview-case/:interviewCaseId/stats - Get tab completion stats for an interview case
  fastify.get('/interview-case-tabs/interview-case/:interviewCaseId/stats', async (request, reply) => {
    try {
      const { interviewCaseId } = interviewCaseTabInterviewCaseParamsSchema.parse(request.params)
      const stats = await interviewCaseTabService.getCaseTabStats(interviewCaseId)
      reply.send(stats)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /interview-case-tabs/interview-course/:interviewCourseId/overview - Get tabs overview for entire interview course
  fastify.get('/interview-case-tabs/interview-course/:interviewCourseId/overview', async (request, reply) => {
    try {
      const { interviewCourseId } = interviewCourseParamsSchema.parse(request.params)
      const overview = await interviewCaseTabService.getCourseTabsOverview(interviewCourseId)
      reply.send(overview)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /interview-case-tabs/:id - Get interview case tab by ID
  fastify.get('/interview-case-tabs/:id', async (request, reply) => {
    try {
      const { id } = interviewCaseTabParamsSchema.parse(request.params)
      const interviewCaseTab = await interviewCaseTabService.findById(id)
      reply.send(interviewCaseTab)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview case tab not found') {
        reply.status(404).send({ error: 'Interview case tab not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /interview-case-tabs/types - Helper endpoint to get tab types
  fastify.get('/interview-case-tabs/types', async (request, reply) => {
    reply.send({
      tabTypes: ['DOCTORS_NOTE', 'PATIENT_SCRIPT', 'MEDICAL_NOTES'],
      descriptions: {
        DOCTORS_NOTE: "Doctor's clinical notes and observations",
        PATIENT_SCRIPT: "Patient dialogue and responses script",
        MEDICAL_NOTES: "Key medical points and references"
      }
    })
  })

  // POST /interview-case-tabs - Create new interview case tab
  fastify.post('/interview-case-tabs', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const data = createInterviewCaseTabSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interviewCase = await interviewCaseService.findById(data.interviewCaseId)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only create tabs for your own interview cases' })
          return
        }
      }

      const interviewCaseTab = await interviewCaseTabService.create(data)
      reply.status(201).send(interviewCaseTab)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview case not found') {
          reply.status(404).send({ error: 'Interview case not found' })
        } else if (error.message.includes('already has a') && error.message.includes('tab')) {
          reply.status(400).send({ error: error.message })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /interview-case-tabs/create-all - Create all 3 tabs for an interview case
  fastify.post('/interview-case-tabs/create-all', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { interviewCaseId } = createAllTabsSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interviewCase = await interviewCaseService.findById(interviewCaseId)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only create tabs for your own interview cases' })
          return
        }
      }

      const tabs = await interviewCaseTabService.createAllTabsForCase(interviewCaseId)
      reply.status(201).send({
        message: 'All tabs created successfully',
        tabs,
        totalCreated: tabs.length
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview case not found') {
          reply.status(404).send({ error: 'Interview case not found' })
        } else if (error.message === 'Some tabs already exist for this case') {
          reply.status(400).send({ error: 'Some tabs already exist for this case' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PUT /interview-case-tabs/:id - Update interview case tab
  fastify.put('/interview-case-tabs/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCaseTabParamsSchema.parse(request.params)
      const data = updateInterviewCaseTabSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interviewCaseTab = await interviewCaseTabService.findById(id)
        const interviewCase = await interviewCaseService.findById(interviewCaseTab.interviewCaseId)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only update tabs for your own interview cases' })
          return
        }
      }

      const interviewCaseTab = await interviewCaseTabService.update(id, data)
      reply.send(interviewCaseTab)
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview case tab not found') {
        reply.status(404).send({ error: 'Interview case tab not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // PUT /interview-case-tabs/interview-case/:interviewCaseId/bulk-update - Update multiple tabs at once
  fastify.put('/interview-case-tabs/interview-case/:interviewCaseId/bulk-update', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { interviewCaseId } = interviewCaseTabInterviewCaseParamsSchema.parse(request.params)
      const { tabUpdates } = bulkUpdateInterviewCaseTabSchema.parse(request.body)

      if (!isAdmin(request)) {
        const interviewCase = await interviewCaseService.findById(interviewCaseId)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only update tabs for your own interview cases' })
          return
        }
      }

      const updatedTabs = await interviewCaseTabService.bulkUpdateTabContent(interviewCaseId, tabUpdates)
      reply.send({
        message: 'Tabs updated successfully',
        updatedTabs,
        totalUpdated: updatedTabs.length
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview case not found') {
          reply.status(404).send({ error: 'Interview case not found' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /interview-case-tabs/:id/content - Add an item to a tab's content array
  fastify.post('/interview-case-tabs/:id/content', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCaseTabParamsSchema.parse(request.params)
      const { content } = z.object({
        content: z.string().max(10000, 'Content must be less than 10,000 characters')
      }).parse(request.body)

      if (!isAdmin(request)) {
        const interviewCaseTab = await interviewCaseTabService.findById(id)
        const interviewCase = await interviewCaseService.findById(interviewCaseTab.interviewCaseId)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only modify tabs for your own interview cases' })
          return
        }
      }

      const interviewCaseTab = await interviewCaseTabService.addContentItem(id, content)
      reply.send({
        message: 'Content item added successfully',
        interviewCaseTab,
        totalItems: interviewCaseTab.content.length
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview case tab not found') {
        reply.status(404).send({ error: 'Interview case tab not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // PUT /interview-case-tabs/:id/content/:index - Update a specific content item
  fastify.put('/interview-case-tabs/:id/content/:index', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCaseTabParamsSchema.parse(request.params)
      const index = parseInt((request.params as any).index as string)
      const { content } = z.object({
        content: z.string().max(10000, 'Content must be less than 10,000 characters')
      }).parse(request.body)

      if (isNaN(index) || index < 0) {
        reply.status(400).send({ error: 'Invalid content index' })
        return
      }

      if (!isAdmin(request)) {
        const interviewCaseTab = await interviewCaseTabService.findById(id)
        const interviewCase = await interviewCaseService.findById(interviewCaseTab.interviewCaseId)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only update tabs for your own interview cases' })
          return
        }
      }

      const interviewCaseTab = await interviewCaseTabService.updateContentItem(id, index, content)
      reply.send({
        message: 'Content item updated successfully',
        interviewCaseTab
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview case tab not found') {
          reply.status(404).send({ error: 'Interview case tab not found' })
        } else if (error.message === 'Invalid content index') {
          reply.status(400).send({ error: 'Invalid content index' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // DELETE /interview-case-tabs/:id/content/:index - Remove a content item
  fastify.delete('/interview-case-tabs/:id/content/:index', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCaseTabParamsSchema.parse(request.params)
      const index = parseInt((request.params as any).index as string)

      if (isNaN(index) || index < 0) {
        reply.status(400).send({ error: 'Invalid content index' })
        return
      }

      if (!isAdmin(request)) {
        const interviewCaseTab = await interviewCaseTabService.findById(id)
        const interviewCase = await interviewCaseService.findById(interviewCaseTab.interviewCaseId)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only delete tab content for your own interview cases' })
          return
        }
      }

      const interviewCaseTab = await interviewCaseTabService.removeContentItem(id, index)
      reply.send({
        message: 'Content item removed successfully',
        interviewCaseTab,
        remainingItems: interviewCaseTab.content.length
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Interview case tab not found') {
          reply.status(404).send({ error: 'Interview case tab not found' })
        } else if (error.message === 'Invalid content index') {
          reply.status(400).send({ error: 'Invalid content index' })
        } else {
          reply.status(400).send({ error: 'Invalid request' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // DELETE /interview-case-tabs/:id - Delete interview case tab
  fastify.delete('/interview-case-tabs/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const { id } = interviewCaseTabParamsSchema.parse(request.params)

      if (!isAdmin(request)) {
        const interviewCaseTab = await interviewCaseTabService.findById(id)
        const interviewCase = await interviewCaseService.findById(interviewCaseTab.interviewCaseId)
        const interviewCourse = await interviewCourseService.findById(interviewCase.interviewCourseId)
        const currentInstructorId = getCurrentInstructorId(request)

        if (!currentInstructorId || interviewCourse.instructorId !== currentInstructorId) {
          reply.status(403).send({ error: 'You can only delete tabs for your own interview cases' })
          return
        }
      }

      await interviewCaseTabService.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Interview case tab not found') {
        reply.status(404).send({ error: 'Interview case tab not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })
}
