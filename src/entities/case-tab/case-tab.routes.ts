import { FastifyInstance } from 'fastify'
import { CaseTabService } from './case-tab.service'
import { 
  createCaseTabSchema, 
  updateCaseTabSchema, 
  caseTabParamsSchema,
  caseTabCourseCaseParamsSchema,
  caseTabTypeParamsSchema,
  courseParamsSchema,
  bulkUpdateCaseTabSchema,
  createAllTabsSchema
} from './case-tab.schema'

export default async function caseTabRoutes(fastify: FastifyInstance) {
  const caseTabService = new CaseTabService(fastify.prisma)

  // GET /case-tabs - Get all case tabs
  fastify.get('/case-tabs', async (request, reply) => {
    try {
      const caseTabs = await caseTabService.findAll()
      reply.send(caseTabs)
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch case tabs' })
    }
  })

  // GET /case-tabs/course-case/:courseCaseId - Get all tabs for a course case
  fastify.get('/case-tabs/course-case/:courseCaseId', async (request, reply) => {
    try {
      const { courseCaseId } = caseTabCourseCaseParamsSchema.parse(request.params)
      const caseTabs = await caseTabService.findByCourseCase(courseCaseId)
      reply.send(caseTabs)
    } catch (error) {
      if (error instanceof Error && error.message === 'Course case not found') {
        reply.status(404).send({ error: 'Course case not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /case-tabs/course-case/:courseCaseId/:tabType - Get specific tab for a course case
  fastify.get('/case-tabs/course-case/:courseCaseId/:tabType', async (request, reply) => {
    try {
      const { courseCaseId, tabType } = caseTabTypeParamsSchema.parse(request.params)
      const caseTab = await caseTabService.findByTabType(courseCaseId, tabType)
      reply.send(caseTab)
    } catch (error) {
      if (error instanceof Error && error.message.includes('tab not found')) {
        reply.status(404).send({ error: error.message })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // GET /case-tabs/course-case/:courseCaseId/stats - Get tab completion stats for a course case
  fastify.get('/case-tabs/course-case/:courseCaseId/stats', async (request, reply) => {
    try {
      const { courseCaseId } = caseTabCourseCaseParamsSchema.parse(request.params)
      const stats = await caseTabService.getCaseTabStats(courseCaseId)
      reply.send(stats)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /case-tabs/course/:courseId/overview - Get tabs overview for entire course
  fastify.get('/case-tabs/course/:courseId/overview', async (request, reply) => {
    try {
      const { courseId } = courseParamsSchema.parse(request.params)
      const overview = await caseTabService.getCourseTabsOverview(courseId)
      reply.send(overview)
    } catch (error) {
      reply.status(400).send({ error: 'Invalid request' })
    }
  })

  // GET /case-tabs/:id - Get case tab by ID
  fastify.get('/case-tabs/:id', async (request, reply) => {
    try {
      const { id } = caseTabParamsSchema.parse(request.params)
      const caseTab = await caseTabService.findById(id)
      reply.send(caseTab)
    } catch (error) {
      if (error instanceof Error && error.message === 'Case tab not found') {
        reply.status(404).send({ error: 'Case tab not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /case-tabs - Create new case tab
  fastify.post('/case-tabs', async (request, reply) => {
    try {
      const data = createCaseTabSchema.parse(request.body)
      const caseTab = await caseTabService.create(data)
      reply.status(201).send(caseTab)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course case not found') {
          reply.status(404).send({ error: 'Course case not found' })
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

  // POST /case-tabs/create-all - Create all 4 tabs for a course case
  fastify.post('/case-tabs/create-all', async (request, reply) => {
    try {
      const { courseCaseId } = createAllTabsSchema.parse(request.body)
      const tabs = await caseTabService.createAllTabsForCase(courseCaseId)
      reply.status(201).send({
        message: 'All tabs created successfully',
        tabs,
        totalCreated: tabs.length
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course case not found') {
          reply.status(404).send({ error: 'Course case not found' })
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

  // PUT /case-tabs/:id - Update case tab
  fastify.put('/case-tabs/:id', async (request, reply) => {
    try {
      const { id } = caseTabParamsSchema.parse(request.params)
      const data = updateCaseTabSchema.parse(request.body)
      const caseTab = await caseTabService.update(id, data)
      reply.send(caseTab)
    } catch (error) {
      if (error instanceof Error && error.message === 'Case tab not found') {
        reply.status(404).send({ error: 'Case tab not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // PUT /case-tabs/course-case/:courseCaseId/bulk-update - Update multiple tabs at once
  fastify.put('/case-tabs/course-case/:courseCaseId/bulk-update', async (request, reply) => {
    try {
      const { courseCaseId } = caseTabCourseCaseParamsSchema.parse(request.params)
      const { tabUpdates } = bulkUpdateCaseTabSchema.parse(request.body)
      
      const updatedTabs = await caseTabService.bulkUpdateTabContent(courseCaseId, tabUpdates)
      reply.send({
        message: 'Tabs updated successfully',
        updatedTabs,
        totalUpdated: updatedTabs.length
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Course case not found') {
          reply.status(404).send({ error: 'Course case not found' })
        } else {
          reply.status(400).send({ error: 'Invalid data' })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // DELETE /case-tabs/:id - Delete case tab
  fastify.delete('/case-tabs/:id', async (request, reply) => {
    try {
      const { id } = caseTabParamsSchema.parse(request.params)
      await caseTabService.delete(id)
      reply.status(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'Case tab not found') {
        reply.status(404).send({ error: 'Case tab not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // Helper endpoint to get tab types (useful for frontend)
  fastify.get('/case-tabs/types', async (request, reply) => {
    reply.send({
      tabTypes: ['DOCTORS_NOTE', 'PATIENT_SCRIPT', 'MARKING_CRITERIA', 'MEDICAL_NOTES'],
      descriptions: {
        DOCTORS_NOTE: "Doctor's clinical notes and observations",
        PATIENT_SCRIPT: "Patient dialogue and responses script",
        MARKING_CRITERIA: "Assessment criteria and scoring rubric",
        MEDICAL_NOTES: "Key medical points and references"
      }
    })
  })
}