import { Prisma, type PrismaClient } from '@prisma/client';
import type { User, UserRepository } from '../services/ports';

const UNIQUE_VIOLATION = 'P2002';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByDeviceId(deviceId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { deviceId } });
  }

  async findOrCreateByDeviceId(deviceId: string): Promise<User> {
    try {
      return await this.prisma.user.upsert({
        where: { deviceId },
        create: { deviceId },
        update: {},
      });
    } catch (error) {
      // Two first requests from one device can race; the loser reads the winner's row.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        return this.prisma.user.findUniqueOrThrow({ where: { deviceId } });
      }
      throw error;
    }
  }
}
