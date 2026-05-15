import { PrismaClient } from '@prisma/client'
import { FastifyBaseLogger } from 'fastify'
import { WebhookReceiver } from 'livekit-server-sdk'
import type { WebhookEvent } from 'livekit-server-sdk'
import { EgressStatus } from '@livekit/protocol'

export class LiveKitWebhookService {
  private receiver: WebhookReceiver

  constructor(private prisma: PrismaClient, private log: FastifyBaseLogger) {
    this.receiver = new WebhookReceiver(
      process.env.LIVEKIT_API_KEY || '',
      process.env.LIVEKIT_API_SECRET || '',
    )
  }

  async verify(rawBody: string, authHeader: string): Promise<WebhookEvent> {
    return this.receiver.receive(rawBody, authHeader)
  }

  private async resolveRecording(roomName: string, egressId: string | undefined) {
    if (egressId) {
      const byEgress = await this.prisma.recording.findUnique({ where: { egressId } })
      if (byEgress) {
        return byEgress
      }
    }
    const caseAttempt = await this.prisma.simulationAttempt.findUnique({
      where: { correlationToken: roomName },
      select: { id: true },
    })
    if (caseAttempt) {
      return this.prisma.recording.findUnique({
        where: { attemptType_attemptId: { attemptType: 'CASE', attemptId: caseAttempt.id } },
      })
    }
    const interviewAttempt = await this.prisma.interviewSimulationAttempt.findUnique({
      where: { correlationToken: roomName },
      select: { id: true },
    })
    if (interviewAttempt) {
      return this.prisma.recording.findUnique({
        where: { attemptType_attemptId: { attemptType: 'INTERVIEW', attemptId: interviewAttempt.id } },
      })
    }
    return null
  }

  async handle(event: WebhookEvent): Promise<void> {
    if (event.event !== 'egress_started' && event.event !== 'egress_ended') {
      return
    }
    const egressInfo = event.egressInfo
    if (!egressInfo) {
      this.log.warn({ event: event.event }, 'LiveKit event missing egressInfo')
      return
    }
    const roomName = egressInfo.roomName
    if (!roomName) {
      this.log.warn({ egressId: egressInfo.egressId }, 'LiveKit egress event missing roomName')
      return
    }

    const recording = await this.resolveRecording(roomName, egressInfo.egressId)
    if (!recording) {
      this.log.warn({ roomName, egressId: egressInfo.egressId }, 'No Recording row matches LiveKit event')
      return
    }

    if (event.event === 'egress_started') {
      if (recording.egressId) {
        return
      }
      await this.prisma.recording.update({
        where: { id: recording.id },
        data: { egressId: egressInfo.egressId },
      })
      return
    }

    // egress_ended — only mutate while still PENDING
    if (recording.status !== 'PENDING') {
      return
    }
    const succeeded = egressInfo.status === EgressStatus.EGRESS_COMPLETE
    const file = egressInfo.fileResults?.[0]
    await this.prisma.recording.update({
      where: { id: recording.id },
      data: {
        status: succeeded ? 'READY' : 'FAILED',
        durationSeconds: file?.duration ? Number(file.duration) : null,
        bytes: file?.size ? BigInt(file.size) : null,
        failureReason: succeeded ? null : (egressInfo.error || null),
      },
    })
  }
}
