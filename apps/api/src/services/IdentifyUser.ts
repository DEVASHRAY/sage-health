import { DeviceNotRegisteredError } from './errors';
import type { User, UserRepository } from './ports';

/** Resolves the caller from the device id. The device must have been bootstrapped. */
export class IdentifyUser {
  constructor(private readonly users: UserRepository) {}

  async execute(deviceId: string): Promise<User> {
    const user = await this.users.findByDeviceId(deviceId);
    if (!user) throw new DeviceNotRegisteredError();
    return user;
  }
}
