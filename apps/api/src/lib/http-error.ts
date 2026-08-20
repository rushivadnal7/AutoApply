export class HttpError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new HttpError(400, "BAD_REQUEST", message, details);
  }
  static unauthorized(message = "Unauthorized") {
    return new HttpError(401, "UNAUTHORIZED", message);
  }
  static forbidden(message = "Forbidden") {
    return new HttpError(403, "FORBIDDEN", message);
  }
  static notFound(message = "Not found") {
    return new HttpError(404, "NOT_FOUND", message);
  }
  static conflict(message: string, details?: unknown) {
    return new HttpError(409, "CONFLICT", message, details);
  }
}
