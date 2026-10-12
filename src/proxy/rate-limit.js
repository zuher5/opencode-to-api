const rateLimitMap = new Map();

const RATE_LIMIT_MAX = {
  opencode: 200, // 200 requests per UTC day
  kilo: 200,     // 200 requests per rolling hour
};

function rateLimitResetAt(upstream, now) {
  if (upstream === "kilo") return now + 60 * 60_000;
  const nextUtcDay = new Date(now);
  nextUtcDay.setUTCHours(24, 0, 0, 0);
  return nextUtcDay.getTime();
}

function rateLimitKey(upstream, ip, now) {
  if (upstream === "kilo") return `${upstream}:${ip}`;
  return `${upstream}:${new Date(now).toISOString().slice(0, 10)}:${ip}`;
}

function pruneExpiredKeys(now) {
  for (const [key, entry] of rateLimitMap.entries()) {
    if (entry.resetAt <= now) {
      rateLimitMap.delete(key);
    }
  }
}

export function checkRateLimit(ip, upstream) {
  const max = RATE_LIMIT_MAX[upstream] || 200;
  const now = Date.now();
  const key = rateLimitKey(upstream, ip, now);
  const entry = rateLimitMap.get(key);

  if (rateLimitMap.size > 500) {
    pruneExpiredKeys(now);
  }

  if (!entry || entry.resetAt <= now) {
    const resetAt = rateLimitResetAt(upstream, now);
    rateLimitMap.set(key, {
      count: 1,
      resetAt,
    });
    return { allowed: true, remaining: max - 1, resetAt };
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: max - entry.count, resetAt: entry.resetAt };
}
