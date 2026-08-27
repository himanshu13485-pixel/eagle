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
    if (!existsSync(path)) {
      // Agents fail silently when this 404s — the webcam overlay is just
      // skipped — so name the expected path to make the gap diagnosable.
      throw new NotFoundException(
        `ffmpeg not published on the server (looked in ${path}). Place a Windows ffmpeg.exe there, or set AGENT_FFMPEG_PATH.`,
      );
    }
    res.download(path, "ffmpeg.exe");
  }

  /**
   * Public, generic uninstaller. Unlike the per-employee download in the
   * dashboard, this needs no auth and no employee id — anyone on a monitored PC
   * can remove the agent from the marketing site. The server-side deactivation
   * uses the agent's own local token read from disk, so no credentials are
   * required here either. It self-elevates to admin to undo the install.
   */
  @Get("uninstaller")
  uninstaller(@Res() res: Response) {
    const server = process.env.AGENT_PUBLIC_URL || `http://localhost:${process.env.API_PORT || 4000}`;
    const bat = [
      "@echo off",
      "net session >nul 2>&1",
      "if %errorLevel% neq 0 (",
      "    echo Requesting administrator privileges...",
      "    powershell -Command \"Start-Process -FilePath '%~dpnx0' -Verb RunAs\"",
      "    exit /b",
      ")",
      `SET "SERVER=${server}"`,
      ":: Free the seat on the server first, using the agent's own local token.",
      "echo Deactivating on the server...",
      "powershell -NoProfile -Command \"try{ $c = Get-Content -Raw '%USERPROFILE%\\.eagle-agent\\config.json' | ConvertFrom-Json; if($c.deviceToken){ Invoke-RestMethod -Uri '%SERVER%/api/devices/deactivate' -Method Post -Headers @{ Authorization = ('Bearer ' + $c.deviceToken) } -TimeoutSec 10 | Out-Null } }catch{} \" >nul 2>&1",
      "echo Removing Workk monitoring agent...",
      "taskkill /F /IM eagle-agent.exe >nul 2>&1",
      'schtasks /Delete /TN "EagleAgent" /F >nul 2>&1',
      "powershell -NoProfile -Command \"Remove-MpPreference -ExclusionPath '%LOCALAPPDATA%\\EagleAgent'\" >nul 2>&1",
      'rmdir /S /Q "%LOCALAPPDATA%\\EagleAgent" >nul 2>&1',
      'rmdir /S /Q "%USERPROFILE%\\.eagle-agent" >nul 2>&1',
      "echo Workk agent removed from this PC.",
      "timeout /t 3 >nul",
      "exit /b 0",
      "",
    ].join("\r\n");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", 'attachment; filename="Workk_Uninstaller.bat"');
    res.send(bat);
  }
}
