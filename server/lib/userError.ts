/**
 * Convert a thrown error into a message safe to show end users.
 * Maps known Postgres SQLSTATE codes to friendly messages and logs the
 * original server-side. Never leaks raw PG error text to the client.
 */
export function friendlyError(e: any, fallback = 'Could not save the entry. Please try again.'): string {
  const code = (e && typeof e === 'object' ? e.code : null) as string | null;
  if (code === '23505') return 'This entry already exists.';
  if (code === '23503') return 'Referenced item could not be found.';
  if (code === '23502') return 'A required field is missing.';
  if (code === '23514') return 'One of the values is not allowed here.';
  if (code === '22001') return 'One of the values is too long.';
  if (code) {
    // eslint-disable-next-line no-console
    console.error('PG error', { code, detail: e?.detail, message: e?.message });
    return fallback;
  }
  return (e && typeof e.message === 'string') ? e.message : fallback;
}
