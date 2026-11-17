/**
 * Failures a use case can report. They carry meaning, not HTTP: the route layer decides which
 * status code each one becomes.
 */
export abstract class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The thing does not exist, or exists but belongs to another user. Callers cannot tell which. */
export class NotFoundError extends ServiceError {
  constructor(what: string) {
    super(`${what} not found`);
  }
}

export class DeviceNotRegisteredError extends ServiceError {
  constructor() {
    super('This device is not registered yet. Call POST /v1/users/bootstrap first.');
  }
}

/** The request is well-formed but breaks a rule the schema cannot express. */
export class InvalidInputError extends ServiceError {}

export class EstimateInputMissingError extends ServiceError {}

export class ImageTooLargeError extends ServiceError {
  constructor(
    readonly actualBytes: number,
    readonly limitBytes: number,
  ) {
    super(`Image is too large: ${actualBytes} bytes decoded, limit is ${limitBytes} bytes.`);
  }
}
