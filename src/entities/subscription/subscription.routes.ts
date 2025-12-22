import { FastifyInstance } from "fastify";
import { SubscriptionService } from "./subscription.service";
import {
  createSubscriptionSchema,
  subscriptionParamsSchema,
  subscriptionStudentParamsSchema,
  subscriptionCourseParamsSchema,
  subscriptionCheckParamsSchema,
  subscriptionQuerySchema,
} from "./subscription.schema";
import {
  requireAuth,
  getCurrentStudentId,
} from "../../middleware/auth.middleware";

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
        reply.status(500).send({ error: "Failed to fetch subscriptions" });
      }
    }
  );

  // GET /subscriptions/my - Get current student's subscriptions
  fastify.get(
    "/subscriptions/my",
    {
      preHandler: requireAuth("student"),
    },
    async (request, reply) => {
      try {
        const studentId = getCurrentStudentId(request)!;
        const query = subscriptionQuerySchema.parse(request.query);
        const subscriptions = await subscriptionService.findByStudent(
          studentId,
          query
        );
        reply.send(subscriptions);
      } catch (error) {
        reply.status(500).send({ error: "Failed to fetch your subscriptions" });
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

  // GET /subscriptions/course/:courseId - Get subscriptions by course (instructor only)
  fastify.get(
    "/subscriptions/course/:courseId",
    {
      preHandler: requireAuth("instructor"),
    },
    async (request, reply) => {
      try {
        const { courseId } = subscriptionCourseParamsSchema.parse(
          request.params
        );
        const query = subscriptionQuerySchema.parse(request.query);
        const subscriptions = await subscriptionService.findByCourse(
          courseId,
          query
        );
        reply.send(subscriptions);
      } catch (error) {
        if (error instanceof Error && error.message === "Course not found") {
          reply.status(404).send({ error: "Course not found" });
        } else {
          reply.status(400).send({ error: "Invalid request" });
        }
      }
    }
  );

  // GET /subscriptions/check/:studentId/:courseId - Check subscription status (instructor)
  fastify.get(
    "/subscriptions/check/:studentId/:courseId",
    {
      preHandler: requireAuth("instructor"),
    },
    async (request, reply) => {
      try {
        const { studentId, courseId } = subscriptionCheckParamsSchema.parse(
          request.params
        );
        const status = await subscriptionService.checkSubscription(
          studentId,
          courseId
        );
        reply.send(status);
      } catch (error) {
        reply.status(400).send({ error: "Invalid request" });
      }
    }
  );

  // GET /subscriptions/my/:courseId/check - Check current student's subscription to a course
  fastify.get(
    "/subscriptions/my/:courseId/check",
    {
      preHandler: requireAuth("student"),
    },
    async (request, reply) => {
      try {
        const studentId = getCurrentStudentId(request)!;
        const { courseId } = subscriptionCourseParamsSchema.parse(
          request.params
        );
        const status = await subscriptionService.checkSubscription(
          studentId,
          courseId
        );
        reply.send(status);
      } catch (error) {
        reply.status(400).send({ error: "Invalid request" });
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
        reply
          .status(500)
          .send({ error: "Failed to fetch subscription statistics" });
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
        reply.status(500).send({ error: "Failed to fetch accessible courses" });
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

  // POST /subscriptions - Create new subscription (mock payment)
  fastify.post(
    "/subscriptions",
    {
      preHandler: requireAuth("student"),
    },
    async (request, reply) => {
      try {
        const studentId = getCurrentStudentId(request)!;
        const data = createSubscriptionSchema.parse(request.body);

        // Ensure student is subscribing for themselves
        if (data.studentId !== studentId) {
          reply
            .status(403)
            .send({ error: "You can only create subscriptions for yourself" });
          return;
        }

        const subscription = await subscriptionService.create(data);

        // Get updated student info for credit balance
        const student = await fastify.prisma.student.findUnique({
          where: { id: studentId },
        });

        reply.status(201).send({
          message: "Subscription created successfully",
          subscription,
          creditsAdded:
            subscription.course.style === "RANDOM"
              ? data.durationMonths === 3
                ? subscription.course.credits3Months
                : data.durationMonths === 6
                ? subscription.course.credits6Months
                : subscription.course.credits12Months
              : 0,
          newCreditBalance: student?.creditBalance || 0,
        });
      } catch (error) {
        // Handle Zod validation errors
        if (error instanceof Error && error.name === "ZodError") {
          const zodError = error as any;
          reply.status(400).send({
            error: "Invalid subscription data",
            details: zodError.errors,
          });
          return;
        }

        if (error instanceof Error) {
          if (error.message === "Student not found") {
            reply.status(404).send({ error: "Student not found" });
          } else if (error.message === "Course not found") {
            reply.status(404).send({ error: "Course not found" });
          } else if (error.message === "Course is not published") {
            reply.status(400).send({ error: "Course is not published" });
          } else if (
            error.message ===
            "Student already has an active subscription to this course"
          ) {
            reply
              .status(400)
              .send({
                error: "You already have an active subscription to this course",
              });
          } else {
            reply.status(400).send({ error: "Invalid subscription data" });
          }
        } else {
          reply.status(500).send({ error: "Internal server error" });
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

  // Helper endpoint to check content access
  fastify.get(
    "/subscriptions/can-access/:courseId",
    {
      preHandler: requireAuth("student"),
    },
    async (request, reply) => {
      try {
        const studentId = getCurrentStudentId(request)!;
        const { courseId } = subscriptionCourseParamsSchema.parse(
          request.params
        );
        const canAccess = await subscriptionService.canAccessCourseContent(
          studentId,
          courseId
        );

        reply.send({
          courseId,
          canAccess,
          reason: canAccess
            ? "Active subscription or free content"
            : "No active subscription",
        });
      } catch (error) {
        reply.status(400).send({ error: "Invalid request" });
      }
    }
  );
}
