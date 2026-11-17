import type { PrismaClient } from '@prisma/client';
import type { AiRequestEntry, AiRequestLog } from '../services/ports';

export class PrismaAiRequestLog implements AiRequestLog {
  constructor(private readonly prisma: PrismaClient) {}

  async record(entry: AiRequestEntry): Promise<void> {
    await this.prisma.aiRequest.create({ data: entry });
  }
}
