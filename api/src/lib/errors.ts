// An error that knows which HTTP status it maps to. Services throw these;
// the error-handling middleware turns them into JSON responses.
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg = "Bad request") => new HttpError(400, msg);
export const unauthorized = (msg = "Unauthorized") => new HttpError(401, msg);
export const forbidden = (msg = "Forbidden") => new HttpError(403, msg);
export const notFound = (msg = "Not found") => new HttpError(404, msg);
export const conflict = (msg = "Conflict") => new HttpError(409, msg);
