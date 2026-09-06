// server/src/utils/jwt.ts
import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/env';
import { AuthPayload } from '../types';

export const generateAccessToken = (payload: AuthPayload): string => {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
};

export const generateRefreshToken = (payload: AuthPayload): string => {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  });
};

export const verifyAccessToken = (token: string): AuthPayload => {
  return jwt.verify(token, config.JWT_SECRET) as AuthPayload;
};

export const verifyRefreshToken = (token: string): AuthPayload => {
  return jwt.verify(token, config.JWT_REFRESH_SECRET) as AuthPayload;
};
