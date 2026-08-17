import { Controller, Get, NotFoundException, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { existsSync } from "fs";
import { join } from "path";

/**
 * Public download of the compiled agent binary. The generated .bat fetches this
 * (unauthenticated by design — the secret is the enrollment token in the .bat,
 * not the binary itself).
 */
@Controller("agent")
export class AgentDistController {
  private exePath(mac = false): string {
    if (mac) {
      return process.env.AGENT_EXE_MAC_PATH || join(process.cwd(), "..", "agent", "dist-bin", "eagle-agent");
    }
    return process.env.AGENT_EXE_PATH || join(process.cwd(), "..", "agent", "dist-bin", "eagle-agent.exe");
  }

  private ffmpegPath(): string {
    return (
      process.env.AGENT_FFMPEG_PATH ||
      join(process.cwd(), "..", "agent", "dist-bin", "ffmpeg.exe")
    );
  }

  @Get("binary")
  binary(@Res() res: Response, @Query("os") os?: string) {
    const mac = os === "mac";
    const path = this.exePath(mac);
    if (!existsSync(path)) {
      throw new NotFoundException(
        mac
          ? "Mac agent not built yet. Build it on macOS/CI (`npm run build:exe -w @eagle/agent`) and place it at apps/agent/dist-bin/eagle-agent."
          : "Agent binary not built yet. Run `npm run build:exe -w @eagle/agent`.",
      );
    }
    res.download(path, mac ? "eagle-agent" : "eagle-agent.exe");
  }

  /** Webcam capture uses ffmpeg; the agent fetches it on demand only when the
   *  Webcam Photos setting is enabled. */
  @Get("ffmpeg")
  ffmpeg(@Res() res: Response) {
    const path = this.ffmpegPath();
    if (!existsSync(path)) throw new NotFoundException("ffmpeg not bundled on the server.");
    res.download(path, "ffmpeg.exe");
  }
}
