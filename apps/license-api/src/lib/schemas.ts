/** Zod-Schemata. Jede Eingabe der API wird hier validiert, unbekannte Felder fallen weg. */
import { z } from 'zod';

const nonce = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, 'Nonce ungueltig');
const isoDate = z.string().datetime({ offset: true });
const deviceId = z.string().regex(/^[A-Z2-9]{26}$/, 'Geraete-ID ungueltig');
const licenseKey = z.string().min(8).max(64);
const appVersion = z.string().regex(/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/);

export const activateSchema = z.object({
  key: licenseKey,
  deviceId,
  appVersion,
  os: z.enum(['windows', 'macos', 'linux']),
  nonce,
  ts: isoDate,
}).strict();

export const heartbeatSchema = z.object({
  token: z.string().max(4096),
  deviceId,
  appVersion,
  nonce,
  ts: isoDate,
}).strict();

export const validateSchema = z.object({
  token: z.string().max(4096),
  nonce,
  ts: isoDate,
}).strict();

export const deactivateDeviceSchema = z.object({
  key: licenseKey,
  deviceId,
}).strict();

export const adminLoginSchema = z.object({
  token: z.string().min(20).max(200),
}).strict();

export const createLicenseSchema = z.object({
  plan: z.enum(['trial', 'monthly', 'yearly', 'lifetime', 'internal', 'developer']),
  ownerName: z.string().min(1).max(200),
  ownerEmail: z.string().email(),
  expiresAt: isoDate.nullable(),
  maxDevices: z.number().int().min(1).max(50).optional(),
  features: z.array(z.string().max(40)).max(50).optional(),
  note: z.string().max(2000).optional(),
}).strict();

export const blockLicenseSchema = z.object({
  reason: z.string().min(3).max(500),
}).strict();

export const extendLicenseSchema = z.object({
  expiresAt: isoDate.nullable(),
}).strict();

export const adminAuditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().uuid().optional(),
}).strict();

export const releaseSchema = z.object({
  version: appVersion,
  channel: z.enum(['stable', 'beta', 'nightly']),
  notesMd: z.string().max(20000),
  downloadUrl: z.string().url(),
  minVersion: appVersion.optional(),
  critical: z.boolean().default(false),
  active: z.boolean().default(true),
}).strict();

export type ActivateInput = z.infer<typeof activateSchema>;
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;
export type CreateLicenseInput = z.infer<typeof createLicenseSchema>;

// --- Firmenkonten (LicenseUser) ---

const password = z.string().min(10).max(200);
const displayName = z.string().min(1).max(120);
const email = z.string().email().max(200);

export const registerLicenseUserSchema = z.object({
  licenseKey: licenseKey,
  email,
  password,
  displayName,
}).strict();

export const loginLicenseUserSchema = z.object({
  licenseKey: licenseKey,
  email,
  password,
}).strict();

export const createLicenseUserSchema = z.object({
  email,
  password,
  displayName,
  role: z.enum(['admin', 'member']).default('member'),
}).strict();

export type RegisterLicenseUserInput = z.infer<typeof registerLicenseUserSchema>;
export type LoginLicenseUserInput = z.infer<typeof loginLicenseUserSchema>;
export type CreateLicenseUserInput = z.infer<typeof createLicenseUserSchema>;
