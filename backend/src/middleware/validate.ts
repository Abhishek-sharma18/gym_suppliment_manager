import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

export const validateBody = (schema: ZodType) =>
  (req: Request, res: Response, next: NextFunction): void => {
    res.locals.body = schema.parse(req.body); // throws ZodError -> errorHandler
    next();
  };

export const validateQuery = (schema: ZodType) =>
  (req: Request, res: Response, next: NextFunction): void => {
    res.locals.query = schema.parse(req.query);
    next();
  };
