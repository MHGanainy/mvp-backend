import { FastifyInstance } from "fastify";
import { SubscriptionService } from "./subscription.service";
import {
  subscriptionParamsSchema,
  subscriptionStudentParamsSchema,
  subscriptionQuerySchema,
  subscriptionResourceParamsSchema,
} from "./subscription.schema";
import {
  requireAuth,
  getCurrentStudentId,
} from "../../middleware/auth.middleware";
import { replyInternalError } from "../../shared/route-error";

export default async function subscriptionRoutes(fastify: FastifyInstance) {
  const subscriptionService = new SubscriptionService(fastify.prisma);

  // GET /subscriptions - Get all subscriptions (admin only - instructors)
  fastify.get(
    "/subscriptions",
    {
      preHandler: requireAuth("instructor"),
    },
    async (request, reply) => {
      try {
        const query = subscriptionQuerySchema.parse(request.query);
        const subscriptions = await subscriptionService.findAll(query);
        reply.send(subscriptions);
      } catch (error) {
        replyInternalError(request, reply, error, 'Failed to fetch subscriptions');
      }
    }
  );

  // GET /subscriptions/my - Get current student's subscriptions (unified — all types)
  fastify.get(
    "/subscriptions/my",
    {
      preHandler: requireAuth("student"),
    },
    async (request, reply) => {
      try {
        const studentId = getCurrentStudentId(request)!;
        const query = subscriptionQuerySchema.parse(request.query);
        const subscriptions = await subscriptionService.findAllByStudent(
          studentId,
          query
        );
        reply.send(subscriptions);
      } catch (error) {
        replyInternalError(request, reply, error, 'Failed to fetch subscriptions');
      }
    }
  );

  // GET /subscriptions/student/:studentId - Get subscriptions by student (instructor only)
  fastify.get(
    "/subscriptions/student/:studentId",
    {
      preHandler: requireAuth("instructor"),
    },
    async (request, reply) => {
      try {
        const { studentId } = subscriptionStudentParamsSchema.parse(
          request.params
        );
        const query = subscriptionQuerySchema.parse(request.query);
        const subscriptions = await subscriptionService.findByStudent(
          studentId,
          query
        );
        reply.send(subscriptions);
      } catch (error) {
        if (error instanceof Error && error.message === "Student not found") {
          reply.status(404).send({ error: "Student not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );

  // GET /subscriptions/my/stats - Get current student's subscription statistics
  fastify.get(
    "/subscriptions/my/stats",
    {
      preHandler: requireAuth("student"),
    },
    async (request, reply) => {
      try {
        const studentId = getCurrentStudentId(request)!;
        const stats = await subscriptionService.getStudentStats(studentId);
        reply.send(stats);
      } catch (error) {
        replyInternalError(request, reply, error, 'Failed to fetch subscription statistics');
      }
    }
  );

  // GET /subscriptions/student/:studentId/stats - Get student subscription stats (instructor)
  fastify.get(
    "/subscriptions/student/:studentId/stats",
    {
      preHandler: requireAuth("instructor"),
    },
    async (request, reply) => {
      try {
        const { studentId } = subscriptionStudentParamsSchema.parse(
          request.params
        );
        const stats = await subscriptionService.getStudentStats(studentId);
        reply.send(stats);
      } catch (error) {
        if (error instanceof Error && error.message === "Student not found") {
          reply.status(404).send({ error: "Student not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );

  // GET /subscriptions/my/courses - Get all courses student has access to
  fastify.get(
    "/subscriptions/my/courses",
    {
      preHandler: requireAuth("student"),
    },
    async (request, reply) => {
      try {
        const studentId = getCurrentStudentId(request)!;
        const accessibleCourseIds =
          await subscriptionService.getAccessibleCourses(studentId);

        // Fetch full course details
        const courses = await fastify.prisma.course.findMany({
          where: {
            id: { in: accessibleCourseIds },
          },
          include: {
            exam: {
              select: {
                id: true,
                title: true,
                slug: true,
              },
            },
          },
        });

        reply.send({
          totalAccessibleCourses: courses.length,
          courses,
        });
      } catch (error) {
        replyInternalError(request, reply, error, 'Failed to fetch accessible courses');
      }
    }
  );

  // GET /subscriptions/:id - Get subscription by ID
  fastify.get(
    "/subscriptions/:id",
    {
      preHandler: requireAuth(),
    },
    async (request, reply) => {
      try {
        const { id } = subscriptionParamsSchema.parse(request.params);
        const subscription = await subscriptionService.findById(id);

        // Check authorization - students can only see their own subscriptions
        const user = request.user as any;
        if (
          user?.role === "student" &&
          subscription.studentId !== getCurrentStudentId(request)
        ) {
          reply.status(403).send({ error: "Access denied" });
          return;
        }

        reply.send(subscription);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Subscription not found"
        ) {
          reply.status(404).send({ error: "Subscription not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );

  // POST /subscriptions/update-status - Update subscription statuses (can be called periodically)
  fastify.post(
    "/subscriptions/update-status",
    {
      preHandler: requireAuth("instructor"),
    },
    async (request, reply) => {
      try {
        await subscriptionService.updateSubscriptionStatus();
        reply.send({ message: "Subscription statuses updated successfully" });
      } catch (error) {
        reply
          .status(500)
          .send({ error: "Failed to update subscription statuses" });
      }
    }
  );

  // GET /subscriptions/my/check/:resourceType/:resourceId - Unified subscription check
  fastify.get(
    "/subscriptions/my/check/:resourceType/:resourceId",
    {
      preHandler: requireAuth("student"),
    },
    async (request, reply) => {
      try {
        const { resourceType, resourceId } = subscriptionResourceParamsSchema.parse(request.params);
        const studentId = getCurrentStudentId(request)!;
        const result = await subscriptionService.checkSubscriptionByResource(studentId, resourceType, resourceId);
        reply.send(result);
      } catch (error) {
        replyInternalError(request, reply, error, 'Failed to check subscription');
      }
    }
  );

  // GET /subscriptions/can-access/:resourceType/:resourceId - Unified access check
  fastify.get(
    "/subscriptions/can-access/:resourceType/:resourceId",
    {
      preHandler: requireAuth("student"),
    },
    async (request, reply) => {
      try {
        const { resourceType, resourceId } = subscriptionResourceParamsSchema.parse(request.params);
        const studentId = getCurrentStudentId(request)!;
        const result = await subscriptionService.canAccessResource(studentId, resourceType, resourceId);
        reply.send(result);
      } catch (error) {
        replyInternalError(request, reply, error, 'Failed to check access');
      }
    }
  );

}
