import { describe, expect, it } from 'vitest';
import { BootstrapUser } from '../../src/services/BootstrapUser';
import { DeviceNotRegisteredError } from '../../src/services/errors';
import { IdentifyUser } from '../../src/services/IdentifyUser';
import { SaveProfile } from '../../src/services/SaveProfile';
import { ashaProfile, DEVICE_A, DEVICE_B } from '../support/fixtures';
import { InMemoryProfileRepository, InMemoryUserRepository } from '../support/inMemoryRepositories';

function setup() {
  const users = new InMemoryUserRepository();
  const profiles = new InMemoryProfileRepository();
  return {
    users,
    profiles,
    bootstrapUser: new BootstrapUser(users, profiles),
    saveProfile: new SaveProfile(profiles),
    identifyUser: new IdentifyUser(users),
  };
}

describe('BootstrapUser', () => {
  it('creates a user with no profile or plan for a new device', async () => {
    const { bootstrapUser } = setup();

    expect(await bootstrapUser.execute(DEVICE_A)).toEqual({
      userId: expect.any(String) as string,
      profile: null,
      plan: null,
    });
  });

  it('is idempotent per device and separate across devices', async () => {
    const { users, bootstrapUser } = setup();

    const first = await bootstrapUser.execute(DEVICE_A);
    const again = await bootstrapUser.execute(DEVICE_A);
    const other = await bootstrapUser.execute(DEVICE_B);

    expect(again.userId).toBe(first.userId);
    expect(other.userId).not.toBe(first.userId);
    expect(users.count).toBe(2);
  });

  it('returns the saved profile and plan on a later launch', async () => {
    const { bootstrapUser, saveProfile } = setup();
    const { userId } = await bootstrapUser.execute(DEVICE_A);
    const saved = await saveProfile.execute(userId, ashaProfile);

    expect(await bootstrapUser.execute(DEVICE_A)).toEqual({ userId, ...saved });
  });
});

describe('SaveProfile', () => {
  it('stores the profile together with the plan computed from it', async () => {
    const { profiles, saveProfile } = setup();

    const result = await saveProfile.execute('u1', ashaProfile);

    expect(result.profile).toEqual(ashaProfile);
    expect(result.plan).toMatchObject({
      maintenanceKcal: 1800,
      targetKcal: 1250,
      proteinTargetG: 115,
    });
    expect(await profiles.findByUserId('u1')).toEqual(result);
  });

  it('recomputes the plan when the profile changes', async () => {
    const { saveProfile } = setup();
    await saveProfile.execute('u1', ashaProfile);

    const updated = await saveProfile.execute('u1', { ...ashaProfile, activity: 'active' });

    expect(updated.plan.maintenanceKcal).toBeGreaterThan(1800);
  });
});

describe('IdentifyUser', () => {
  it('resolves a bootstrapped device', async () => {
    const { bootstrapUser, identifyUser } = setup();
    const { userId } = await bootstrapUser.execute(DEVICE_A);

    expect((await identifyUser.execute(DEVICE_A)).id).toBe(userId);
  });

  it('rejects a device that never bootstrapped, without creating a user', async () => {
    const { users, identifyUser } = setup();

    await expect(identifyUser.execute(DEVICE_A)).rejects.toBeInstanceOf(DeviceNotRegisteredError);
    expect(users.count).toBe(0);
  });
});
