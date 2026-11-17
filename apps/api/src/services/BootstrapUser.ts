import type { BootstrapResponse } from '@sage/shared';
import type { ProfileRepository, UserRepository } from './ports';

/** First call a device makes. Idempotent: repeat calls return the same user and its state. */
export class BootstrapUser {
  constructor(
    private readonly users: UserRepository,
    private readonly profiles: ProfileRepository,
  ) {}

  async execute(deviceId: string): Promise<BootstrapResponse> {
    const user = await this.users.findOrCreateByDeviceId(deviceId);
    const record = await this.profiles.findByUserId(user.id);
    return { userId: user.id, profile: record?.profile ?? null, plan: record?.plan ?? null };
  }
}
