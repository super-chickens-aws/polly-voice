import type { NextFunction, Request, Response } from 'express';
export declare class AppError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string);
}
export declare function notFoundHandler(req: Request, _res: Response, next: NextFunction): void;
export declare function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void;
