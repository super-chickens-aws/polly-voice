import type { NextFunction, Request, Response } from 'express';
export declare function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void>;
export declare function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void>;
