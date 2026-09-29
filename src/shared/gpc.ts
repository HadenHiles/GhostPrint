/** Accepts a hostname only; URLs, ports, paths, and wildcard syntax are rejected. */
export function normalizeGpcException(value: string): string | null {
  const hostname = value.trim().toLowerCase();
  if (
    hostname.length === 0 ||
    hostname.length > 253 ||
    hostname.startsWith('.') ||
    hostname.endsWith('.') ||
    hostname.includes('..') ||
    !/^[a-z0-9.-]+$/.test(hostname)
  ) {
    return null;
  }

  try {
    const parsed = new URL(`https://${hostname}`);
    if (parsed.hostname !== hostname || parsed.pathname !== '/') return null;
  } catch {
    return null;
  }
  return hostname;
}

export function isGpcExcepted(hostname: string, exceptions: string[]): boolean {
  const normalized = hostname.toLowerCase();
  return exceptions.some((exception) => normalized === exception || normalized.endsWith(`.${exception}`));
}