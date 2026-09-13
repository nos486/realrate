/**
 * AppError.js — Application-level custom error class with HTTP status code and machine-readable error code.
 */

export class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} [statusCode=400] - HTTP status code
   * @param {string} [code="BAD_REQUEST"] - Machine-readable error code
   */
  constructor(message, statusCode = 400, code = "BAD_REQUEST") {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  static badRequest(message = "درخواست نامعتبر است.", code = "BAD_REQUEST") {
    return new AppError(message, 400, code);
  }

  static unauthorized(message = "لطفاً ابتدا وارد حساب کاربری خود شوید.", code = "UNAUTHORIZED") {
    return new AppError(message, 401, code);
  }

  static forbidden(message = "شما اجازه دسترسی به این بخش را ندارید.", code = "FORBIDDEN") {
    return new AppError(message, 403, code);
  }

  static notFound(message = "موردی یافت نشد.", code = "NOT_FOUND") {
    return new AppError(message, 404, code);
  }

  static internal(message = "خطای داخلی سرور رخ داده است.", code = "INTERNAL_SERVER_ERROR") {
    return new AppError(message, 500, code);
  }
}
