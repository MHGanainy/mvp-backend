// src/entities/marking-criterion/marking-criterion.routes.ts
import { FastifyInstance } from "fastify";
import { MarkingCriterionService } from "./marking-criterion.service";
import { CourseCaseService } from "../course-case/course-case.service";
import { CourseService } from "../course/course.service";
import {
  createMarkingCriterionSchema,
  updateMarkingCriterionSchema,
  bulkUpdateMarkingCriteriaSchema,
  markingCriterionParamsSchema,
  courseCaseParamsSchema,
} from "./marking-criterion.schema";
import {
  authenticate,
  getCurrentInstructorId,
  isAdmin,
} from "../../middleware/auth.middleware";
import { replyInternalError } from "../../shared/route-error";

export default async function markingCriterionRoutes(fastify: FastifyInstance) {
  const service = new MarkingCriterionService(fastify.prisma);
  const courseCaseService = new CourseCaseService(fastify.prisma);
  const courseService = new CourseService(fastify.prisma);

  // GET /marking-criteria/case/:courseCaseId - Get all criteria for a case (course case or interview case), grouped by domain
  fastify.get(
    "/marking-criteria/case/:courseCaseId",
    async (request, reply) => {
      try {
        const { courseCaseId } = courseCaseParamsSchema.parse(request.params);
        const groupedCriteria = await service.findAllByCaseId(courseCaseId);
        reply.send(groupedCriteria);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "Course case not found" ||
            error.message === "Case not found")
        ) {
          reply.status(404).send({ error: "Case not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );

  // GET /marking-criteria/case/:courseCaseId/stats - Get stats for a case's marking criteria (course case or interview case)
  fastify.get(
    "/marking-criteria/case/:courseCaseId/stats",
    async (request, reply) => {
      try {
        const { courseCaseId } = courseCaseParamsSchema.parse(request.params);
        const stats = await service.getCaseStatsByCaseId(courseCaseId);
        reply.send(stats);
      } catch (error) {
        if (error instanceof Error && error.message === "Case not found") {
          reply.status(404).send({ error: "Case not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );

  // GET /marking-criteria/:id - Get a single criterion
  fastify.get("/marking-criteria/:id", async (request, reply) => {
    try {
      const { id } = markingCriterionParamsSchema.parse(request.params);
      const criterion = await service.findById(id);
      reply.send(criterion);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Marking criterion not found"
      ) {
        reply.status(404).send({ error: "Marking criterion not found" });
      } else {
        reply.status(400).send({ error: "Invalid request" });
      }
    }
  });

  // POST /marking-criteria - Create a single new criterion
  fastify.post(
    "/marking-criteria",
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      try {
        const data = createMarkingCriterionSchema.parse(request.body);

        if (!isAdmin(request)) {
          const courseCase = await courseCaseService.findById(
            data.courseCaseId
          );
          const course = await courseService.findById(courseCase.courseId);
          const currentInstructorId = getCurrentInstructorId(request);

          if (
            !currentInstructorId ||
            course.instructorId !== currentInstructorId
          ) {
            reply
              .status(403)
              .send({
                error: "You can only create criteria for your own course cases",
              });
            return;
          }
        }

        const criterion = await service.create(data);
        reply.status(201).send(criterion);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes("not found")) {
            reply.status(404).send({ error: error.message });
          } else {
            reply.status(400).send({ error: "Invalid data" });
          }
        } else {
          replyInternalError(request, reply, error, 'Failed to create marking criterion');
        }
      }
    }
  );

  // PUT /marking-criteria/case/bulk - Bulk create/update/delete criteria for a case
  fastify.put(
    "/marking-criteria/case/bulk",
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      try {
        const data = bulkUpdateMarkingCriteriaSchema.parse(request.body);

        if (!isAdmin(request)) {
          const courseCase = await courseCaseService.findById(
            data.courseCaseId
          );
          const course = await courseService.findById(courseCase.courseId);
          const currentInstructorId = getCurrentInstructorId(request);

          if (
            !currentInstructorId ||
            course.instructorId !== currentInstructorId
          ) {
            reply
              .status(403)
              .send({
                error: "You can only update criteria for your own course cases",
              });
            return;
          }
        }

        const updatedCriteria = await service.bulkUpdate(data);
        reply.send({
          message: "Marking criteria updated successfully",
          count: updatedCriteria.length,
          criteria: updatedCriteria,
        });
      } catch (error) {
        reply.status(400).send({ error: "Invalid data" });
      }
    }
  );

  // PUT /marking-criteria/:id - Update a single criterion
  fastify.put(
    "/marking-criteria/:id",
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      try {
        const { id } = markingCriterionParamsSchema.parse(request.params);
        const data = updateMarkingCriterionSchema.parse(request.body);

        if (!isAdmin(request)) {
          const criterion = await service.findById(id);
          const courseCase = await courseCaseService.findById(
            criterion.courseCaseId
          );
          const course = await courseService.findById(courseCase.courseId);
          const currentInstructorId = getCurrentInstructorId(request);

          if (
            !currentInstructorId ||
            course.instructorId !== currentInstructorId
          ) {
            reply
              .status(403)
              .send({
                error: "You can only update criteria for your own course cases",
              });
            return;
          }
        }

        const criterion = await service.update(id, data);
        reply.send(criterion);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Marking criterion not found"
        ) {
          reply.status(404).send({ error: "Marking criterion not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );

  // DELETE /marking-criteria/:id - Delete a single criterion
  fastify.delete(
    "/marking-criteria/:id",
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      try {
        const { id } = markingCriterionParamsSchema.parse(request.params);

        if (!isAdmin(request)) {
          const criterion = await service.findById(id);
          const courseCase = await courseCaseService.findById(
            criterion.courseCaseId
          );
          const course = await courseService.findById(courseCase.courseId);
          const currentInstructorId = getCurrentInstructorId(request);

          if (
            !currentInstructorId ||
            course.instructorId !== currentInstructorId
          ) {
            reply
              .status(403)
              .send({
                error:
                  "You can only delete criteria from your own course cases",
              });
            return;
          }
        }

        await service.delete(id);
        reply.status(204).send();
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Marking criterion not found"
        ) {
          reply.status(404).send({ error: "Marking criterion not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );
}
