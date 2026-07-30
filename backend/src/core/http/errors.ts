import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} was not found.`));
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof ZodError) {
    const fieldErrors = Object.fromEntries(
      error.issues.map((issue) => [issue.path.join('.'), issue.message])
    );
    res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'The submitted data is invalid.',
      fieldErrors
    });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({
      timestamp: new Date().toISOString(),
      status: error.status,
      code: error.code,
      message: error.message,
      fieldErrors: {}
    });
    return;
  }
  console.error(error);
  res.status(500).json({
    timestamp: new Date().toISOString(),
    status: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An error occurred while processing your request.',
    fieldErrors: {}
  });
}
