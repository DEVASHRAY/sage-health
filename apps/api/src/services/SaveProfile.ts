import { calculatePlan, type Profile, type ProfileResponse } from '@sage/shared';
import type { ProfileRepository } from './ports';

/** Saves the profile and the plan computed from it, replacing any earlier ones. */
export class SaveProfile {
  constructor(private readonly profiles: ProfileRepository) {}

  async execute(userId: string, profile: Profile): Promise<ProfileResponse> {
    const plan = calculatePlan(profile);
    return this.profiles.save(userId, { profile, plan });
  }
}
