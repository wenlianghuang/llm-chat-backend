export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400);
    this.name = "BadRequestError";
  }
}

export class LlmError extends AppError {
  constructor(message: string, statusCode = 502) {
    super(message, statusCode);
    this.name = "LlmError";
  }
}
