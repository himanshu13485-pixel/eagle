import { Controller, Get, NotFoundException, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { StorageService } from "./storage.service";

/**
 * Serves locally-stored files (screenshots, avatars) behind a signed, expiring
 * URL produced by StorageService.presignGet.
 *
 * This replaces `app.useStaticAssets(storageDir, { prefix: "/api/files/" })`,
 * which served every stored screenshot to anyone who had the path, with no
 * authentication and no expiry. For a product whose whole job is holding
 * employees' screens, a leaked or logged URL meant permanent access.
 *
 * The signature covers the key and the expiry, so a link cannot be edited to
 * point at a different file or to last longer.
 */
@Controller("files")
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Get("*")
  async get(
    @Req() req: Request,
    @Res() res: Response,
    @Query("e") expires?: string,
    @Query("s") sig?: string,
  ) {
    // Everything after the first "/files/", still URL-encoded. Matched rather
    // than stripped from the start, because req.path carries the global "api"
    // prefix and so does not begin with "/files/".
    const raw = /\/files\/(.+)$/.exec(req.path)?.[1] ?? "";
    const key = safeKey(decodeSafely(raw));
    if (!key || !this.storage.verifyFileUrl(key, expires, sig)) {
      // One response for "no such file", "bad signature" and "expired", so the
      // endpoint can't be used to probe which keys exist.
      throw new NotFoundException();
    }

    const stream = await this.storage.getStream(key);
    if (!stream) throw new NotFoundException();

    res.type(contentTypeFor(key));
    // Private: a signed URL may pass through shared caches, and these are
    // screenshots of someone's desktop.
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    stream.pipe(res);
  }
}

/** decodeURIComponent throws on a malformed escape; a bad URL is just a 404. */
export function decodeSafely(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return "";
  }
}

/** Reject anything that could climb out of the storage directory. */
export function safeKey(key: string): string | null {
  if (!key || key.length > 512) return null;
  if (key.includes("\0") || key.includes("\\")) return null;
  const parts = key.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return null;
  return key;
}

export function contentTypeFor(key: string): string {
  const ext = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "zip") return "application/zip";
  return "image/jpeg";
}
