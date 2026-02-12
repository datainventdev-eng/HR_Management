import { Request } from 'express';
import { CurrentUser } from './current-user.interface';

export interface AuthenticatedRequest extends Request {
  user?: CurrentUser;
}
