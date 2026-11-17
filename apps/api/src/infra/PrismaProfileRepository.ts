import type { PrismaClient } from '@prisma/client';
import type { ProfileRecord, ProfileRepository } from '../services/ports';
import { toProfileRecord } from './prismaMappers';

export class PrismaProfileRepository implements ProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserId(userId: string): Promise<ProfileRecord | null> {
    const row = await this.prisma.profile.findUnique({ where: { userId } });
    return row ? toProfileRecord(row) : null;
  }

  async save(userId: string, { profile, plan }: ProfileRecord): Promise<ProfileRecord> {
    const fields = {
      name: profile.name,
      sex: profile.sex ?? null,
      age: profile.age,
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
      goalWeightKg: profile.goalWeightKg,
      activity: profile.activity,
      ...plan,
    };
    const row = await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, ...fields },
      update: fields,
    });
    return toProfileRecord(row);
  }
}
