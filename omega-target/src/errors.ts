/** @module omega-target/errors */

export class NetworkError extends Error {
  cause?: any;

  constructor(err?: any) {
    super();
    this.cause = err;
    this.name = 'NetworkError';
  }
}

export class HttpError extends NetworkError {
  statusCode?: number;

  constructor() {
    super();
    this.statusCode = this.cause?.statusCode;
    this.name = 'HttpError';
  }
}

export class HttpNotFoundError extends HttpError {
  constructor() {
    super();
    this.name = 'HttpNotFoundError';
  }
}

export class HttpServerError extends HttpError {
  constructor() {
    super();
    this.name = 'HttpServerError';
  }
}

export class ContentTypeRejectedError extends Error {
  constructor() {
    super();
    this.name = 'ContentTypeRejectedError';
  }
}

