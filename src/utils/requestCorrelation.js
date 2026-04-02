/**
 * Browser-safe correlation IDs for calculator / instrument logs.
 */

export function generateRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}
