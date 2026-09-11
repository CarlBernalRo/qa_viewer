/** Error de negocio con un código estable que la capa HTTP traduce a un status. */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `No existe ${entity} con id "${id}".`);
  }
}

export class InvalidStateError extends DomainError {
  constructor(message: string) {
    super('INVALID_STATE', message);
  }
}

export class LimitReachedError extends DomainError {
  constructor(message: string) {
    super('LIMIT_REACHED', message);
  }
}

export class FeatureNotAvailableError extends DomainError {
  constructor(message: string) {
    super('FEATURE_NOT_AVAILABLE', message);
  }
}
