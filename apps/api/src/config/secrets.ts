/**
 * The JWT signing secrets, resolved once at startup.
 *
 * These used to be read inline as `process.env.JWT_ACCESS_SECRET ?? "change-me-access"`
 * in eleven places. A deploy that forgot the variable booted happily on a
 * secret that is public in this repo's history — enough for anyone to mint a
 * `scope: "platform"` super-admin token for the whole platform. Production now
 * refuses to start instead.
 *
 * Read lazily, not at import time: ConfigModule loads .env while the module
 * graph is built, which is after this file's imports are evaluated.
 */

const DEV_FALLBACK = { access: "change-me-access", refresh: "change-me-refresh" } as const;

let cached: { access: string; refresh: string } | null = null;

export function jwtSecrets(): { access: string; refresh: string } {
  if (cached) return cached;

  const access = process.env.JWT_ACCESS_SECRET;
  const refresh = process.env.JWT_REFRESH_SECRET;

  if (process.env.NODE_ENV === "production") {
    const missing = [!access && "JWT_ACCESS_SECRET", !refresh && "JWT_REFRESH_SECRET"].filter(Boolean);
    if (missing.length) {
      throw new Error(
        `${missing.join(" and ")} must be set in production. Refusing to start on a known default — ` +
          "anyone could forge an admin token. Generate one with: openssl rand -hex 32",
      );
    }
    if (access === DEV_FALLBACK.access || refresh === DEV_FALLBACK.refresh) {
      throw new Error("JWT secrets are still set to the development defaults. Generate real ones: openssl rand -hex 32");
    }
  }

  cached = { access: access || DEV_FALLBACK.access, refresh: refresh || DEV_FALLBACK.refresh };
  return cached;
}

export const accessSecret = () => jwtSecrets().access;
export const refreshSecret = () => jwtSecrets().refresh;
