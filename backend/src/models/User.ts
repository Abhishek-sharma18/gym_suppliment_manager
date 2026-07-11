import { Schema, model } from 'mongoose';
import type { Role } from '@gym/shared';
import { ROLES } from '@gym/shared';
import { auditFields } from './common';

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
}

const schema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ROLES, required: true },
  isActive: { type: Boolean, default: true },
  ...auditFields,
}, { timestamps: true, collection: 'users' });

export const User = model<IUser>('User', schema);
