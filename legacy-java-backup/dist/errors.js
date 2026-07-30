import { ZodError } from 'zod';
export class AppError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
export function notFoundHandler(req, _res, next) {
    next(new AppError(404, 'ROUTE_NOT_FOUND', `Không tìm thấy ${req.method} ${req.path}`));
}
export function errorHandler(error, _req, res, _next) {
    if (error instanceof ZodError) {
        const fieldErrors = Object.fromEntries(error.issues.map((issue) => [issue.path.join('.'), issue.message]));
        res.status(400).json({
            timestamp: new Date().toISOString(),
            status: 400,
            code: 'VALIDATION_FAILED',
            message: 'Dữ liệu gửi lên không hợp lệ.',
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
        message: 'Đã xảy ra lỗi trong quá trình xử lý.',
        fieldErrors: {}
    });
}
//# sourceMappingURL=errors.js.map