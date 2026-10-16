import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny, ZodError } from 'zod';

export const validate = (schema: ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
    try {
        schema.parse(req.body);
        next();
    } catch (error: any) {
        if (error instanceof ZodError) {
            return res.status(400).json({
                error: 'Validation failed',
                details: error.issues
            });
        }
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};
