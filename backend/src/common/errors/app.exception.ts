import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(
    public code: string,
    message: string,
    status = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>
  ) {
    super({ success: false, code, message, ...(details ? details : {}) }, status);
  }
}
