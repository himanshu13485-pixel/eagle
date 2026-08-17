import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { PresenceStatus, type EmployeeDto } from "@eagle/shared";

// Teams allowed per product tier (mirrors billing/teams). BUSINESS = unlimited.
const TEAM_LIMIT: Record<string, number> = { BASIC: 2, PROFESSIONAL: 10, BUSINESS: Number.POSITIVE_INFINITY };

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Everything the profile page needs in one call: summary, 7-day stats, top apps, recent shots. */
  async profile(orgId: string, id: string) {
    const e = await this.prisma.employee.findFirst({
      where: { id, orgId },
      include: this.dtoInclude,
    });
    if (!e) throw new NotFoundException("Employee not found");
    const employee = await this.toDto(e);

    const since = new Date(Date.now() - 7 * 86400_000);
    const acts = await this.prisma.activitySession.findMany({
      where: { orgId, employeeId: id, startedAt: { gte: since } },
      select: { name: true, isIdle: true, durationSec: true },
    });
    let usageSec = 0;
    let idleSec = 0;
    const byApp = new Map<string, number>();
    for (const a of acts) {
      if (a.isIdle) idleSec += a.durationSec;
      else {
        usageSec += a.durationSec;
        byApp.set(a.name, (byApp.get(a.name) ?? 0) + a.durationSec);
      }
    }
    const topApps = [...byApp.entries()]
      .map(([name, sec]) => ({ name, sec }))
      .sort((a, b) => b.sec - a.sec)
      .slice(0, 6);

    const shots = await this.prisma.screenshot.findMany({
      where: { employeeId: id },
      orderBy: { capturedAt: "desc" },
      take: 12,
    });
    const recentShots = await Promise.all(
      shots.map(async (s) => ({
        id: s.id,
        capturedAt: s.capturedAt.toISOString(),
        app: s.app,
        trigger: s.trigger,
        isIdle: s.isIdle,
        imageUrl: await this.storage.presignGet(s.s3Key),
      })),
    );
    const screenshotCount = await this.prisma.screenshot.count({ where: { employeeId: id } });

    return { employee, stats: { usageSec, idleSec, screenshotCount, since: since.toISOString() }, topApps, recentShots };
  }

  /** On-demand screenshot: signal the employee's agent to capture immediately. */
  async screenshotRequest(orgId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id, orgId } });
    if (!employee) throw new NotFoundException("Employee not found");
    return { ok: true, reached: this.realtime.requestCapture(id) };
  }

  /** Map a prisma employee row (with team + latest device) to the wire DTO, presigning the avatar. */
  private async toDto(e: any): Promise<EmployeeDto> {
    const d = e.devices?.[0];
    // No enrolled device yet → the agent hasn't been installed/run: show as "Invited"
    // (pending setup) instead of a misleading "Offline". Once it enrolls + heartbeats,
    // the real ACTIVE/IDLE/OFFLINE status takes over.
    const status = e.active && !d ? "INVITED" : (e.status as string);
    return {
      id: e.id,
      name: e.name,
      email: e.email,
      role: e.role ?? "EMPLOYEE",
      avatarUrl: e.avatarKey ? await this.storage.presignGet(e.avatarKey) : null,
      teamId: e.teamId,
      teamName: e.team?.name ?? null,
      status: status as never,
      active: e.active,
      lastActiveAt: e.lastActiveAt?.toISOString() ?? null,
      lastScreenshotAt: e.lastScreenshotAt?.toISOString() ?? null,
      lastApp: e.lastApp,
      deviceCount: e._count?.devices ?? 0,
      agent: d
        ? { platform: d.platform, version: d.agentVersion, lastSeenAt: d.lastSeenAt?.toISOString() ?? null }
        : null,
    };
  }

  private readonly dtoInclude = {
    team: { select: { name: true } },
    _count: { select: { devices: true } },
    devices: {
      where: { enrolled: true },
      orderBy: { lastSeenAt: "desc" as const },
      take: 1,
      select: { platform: true, agentVersion: true, lastSeenAt: true },
    },
  };

  async list(orgId: string): Promise<EmployeeDto[]> {
    const rows = await this.prisma.employee.findMany({
      where: { orgId },
      orderBy: { createdAt: "asc" }, // insertion order — new hires append to the end
      include: this.dtoInclude,
    });
    return Promise.all(rows.map((e) => this.toDto(e)));
  }

  /** A new employee (or an activation) consumes a paid seat — block if none are available. */
  private async assertSeatAvailable(orgId: string) {
    const [sub, activeUsers] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { orgId }, select: { seats: true } }),
      this.prisma.employee.count({ where: { orgId, active: true } }),
    ]);
    const seats = sub?.seats ?? 10;
    if (activeUsers >= seats) {
      throw new BadRequestException(`Seat limit reached (${activeUsers}/${seats}). Add seats in Billing before adding or activating more employees.`);
    }
  }

  /** Find (or create) a department Team by name within the org. Returns undefined = "no change".
   *  Creating a NEW team respects the tier team limit (same rule as the Teams page). */
  private async resolveTeamId(orgId: string, department?: string | null): Promise<string | null | undefined> {
    if (department === undefined) return undefined;
    const name = (department ?? "").trim();
    if (!name) return null; // cleared
    const existing = await this.prisma.team.findFirst({ where: { orgId, name } });
    if (existing) return existing.id;
    const [used, sub] = await Promise.all([
      this.prisma.team.count({ where: { orgId } }),
      this.prisma.subscription.findUnique({ where: { orgId }, select: { tier: true } }),
    ]);
    const limit = TEAM_LIMIT[sub?.tier ?? "PROFESSIONAL"] ?? 10;
    if (used >= limit) {
      throw new BadRequestException(`Team limit reached (${used}/${limit}). Upgrade your product tier to add a new department/team, or pick an existing one.`);
    }
    const team = await this.prisma.team.create({ data: { orgId, name } });
    return team.id;
  }

  async update(
    orgId: string,
    id: string,
    data: { name?: string; email?: string | null; department?: string | null; role?: string },
  ) {
    const employee = await this.prisma.employee.findFirst({ where: { id, orgId } });
    if (!employee) throw new NotFoundException("Employee not found");
    const teamId = await this.resolveTeamId(orgId, data.department);
    return this.prisma.employee.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(teamId !== undefined ? { teamId } : {}),
      },
    });
  }

  /** Store an uploaded profile image and point the employee at it. */
  async setAvatar(orgId: string, id: string, file: { buffer: Buffer; mimetype?: string }) {
    const employee = await this.prisma.employee.findFirst({ where: { id, orgId } });
    if (!employee) throw new NotFoundException("Employee not found");
    const ext = (file.mimetype?.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const key = `avatars/${orgId}/${id}-${Date.now()}.${ext}`;
    await this.storage.putImage(key, file.buffer, file.mimetype || "image/jpeg");
    if (employee.avatarKey) await this.storage.deleteImage(employee.avatarKey).catch(() => {});
    await this.prisma.employee.update({ where: { id }, data: { avatarKey: key } });
    return { avatarUrl: await this.storage.presignGet(key) };
  }

  /** Effective per-employee tracking settings (org defaults overlaid with this employee's override). */
  async getSettings(orgId: string, id: string) {
    const [employee, org] = await Promise.all([
      this.prisma.employee.findFirst({ where: { id, orgId }, select: { settingsJson: true } }),
      this.prisma.trackingSetting.findUnique({ where: { orgId } }),
    ]);
    if (!employee) throw new NotFoundException("Employee not found");
    const base = {
      periodicScreenshots: org?.periodicScreenshots ?? true,
      screenshotIntervalMin: org?.screenshotIntervalMin ?? 10,
      appSwitchScreenshots: org?.appSwitchScreenshots ?? true,
      appSwitchDelayMin: org?.appSwitchDelayMin ?? 1,
      webcamPhotos: org?.webcamPhotos ?? false,
      idleAfterMin: org?.idleAfterMin ?? 5,
      trackingMode: org?.trackingMode ?? "VISIBLE",
      strictTimeTracking: org?.strictTimeTracking ?? true,
    };
    let override = {};
    if (employee.settingsJson) {
      try {
        override = JSON.parse(employee.settingsJson);
      } catch {
        /* ignore */
      }
    }
    return { ...base, ...override, hasOverride: !!employee.settingsJson };
  }

  async setSettings(orgId: string, id: string, config: Record<string, unknown>) {
    const employee = await this.prisma.employee.findFirst({ where: { id, orgId } });
    if (!employee) throw new NotFoundException("Employee not found");
    await this.prisma.employee.update({ where: { id }, data: { settingsJson: JSON.stringify(config) } });
    return { ok: true };
  }

  async create(
    orgId: string,
    data: { name: string; email?: string | null; department?: string | null; role?: string },
  ) {
    await this.assertSeatAvailable(orgId); // a new employee is active → consumes a seat
    const teamId = await this.resolveTeamId(orgId, data.department);
    return this.prisma.employee.create({
      data: {
        orgId,
        name: data.name,
        email: data.email ?? null,
        role: data.role ?? "EMPLOYEE",
        teamId: teamId ?? null,
      },
    });
  }

  /** Generates a fresh device row + one-time enrollment token for the agent installer. */
  async createEnrollToken(orgId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, orgId } });
    if (!employee) throw new Error("Employee not found");
    const enrollToken = randomBytes(16).toString("hex");
    const device = await this.prisma.device.create({
      data: { orgId, employeeId, enrollToken, enrolled: false },
    });
    return { deviceId: device.id, enrollToken };
  }

  /** Builds a personalized installer (Windows .bat or macOS .command) that downloads
   *  the agent, sets it to auto-start, and enrolls it with a one-time token. */
  async buildInstaller(orgId: string, employeeId: string, os: "win" | "mac" = "win") {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, orgId } });
    if (!employee) throw new NotFoundException("Employee not found");
    const { enrollToken } = await this.createEnrollToken(orgId, employeeId);

    const server = process.env.AGENT_PUBLIC_URL || `http://localhost:${process.env.API_PORT || 4000}`;
    const exeUrl = `${server}/api/agent/binary`;
    const safe = employee.name.replace(/[^a-z0-9]+/gi, "_");

    if (os === "mac") {
      const sh = [
        "#!/bin/bash",
        "# Eagle monitoring agent — macOS installer",
        `SERVER="${server}"`,
        `TOKEN="${enrollToken}"`,
        'DIR="$HOME/.eagle-agent"',
        'BIN="$DIR/eagle-agent"',
        'PLIST="$HOME/Library/LaunchAgents/com.eagle.agent.plist"',
        "",
        `echo "Installing Eagle agent for ${employee.name}..."`,
        'mkdir -p "$DIR"',
        'launchctl unload "$PLIST" 2>/dev/null || true',
        "pkill -f eagle-agent 2>/dev/null || true",
        "",
        'echo "Downloading agent..."',
        `curl -fsSL -o "$BIN" "${exeUrl}?os=mac"`,
        'chmod +x "$BIN"',
        'xattr -dr com.apple.quarantine "$BIN" 2>/dev/null || true',
        "",
        'echo "Registering auto-start (launchd)..."',
        'cat > "$PLIST" <<PLISTEOF',
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0">',
        "<dict>",
        "  <key>Label</key><string>com.eagle.agent</string>",
        "  <key>ProgramArguments</key>",
        "  <array>",
        "    <string>$BIN</string>",
        "    <string>--server</string><string>$SERVER</string>",
        "    <string>--token</string><string>$TOKEN</string>",
        "  </array>",
        "  <key>RunAtLoad</key><true/>",
        "  <key>KeepAlive</key><true/>",
        "</dict>",
        "</plist>",
        "PLISTEOF",
        "",
        'launchctl load "$PLIST"',
        'echo ""',
        'echo "Done. IMPORTANT — grant Screen Recording so screenshots work:"',
        'echo "  System Settings > Privacy & Security > Screen Recording > enable eagle-agent (or Terminal)."',
        'echo "You may also be asked to allow Automation for the active-app check."',
        "",
      ].join("\n");
      return { filename: `Eagle_${safe}_Installer.command`, content: sh, enrollToken, server };
    }

    const bat = [
      "@echo off",
      "net session >nul 2>&1",
      "if %errorLevel% neq 0 (",
      "    echo Requesting administrator privileges...",
      "    powershell -Command \"Start-Process -FilePath '%~dpnx0' -Verb RunAs\"",
      "    exit /b",
      ")",
      "setlocal enabledelayedexpansion",
      `SET "SERVER=${server}"`,
      `SET "TOKEN=${enrollToken}"`,
      `SET "EXE_URL=${exeUrl}"`,
      'SET "INSTALL_DIR=%LOCALAPPDATA%\\EagleAgent"',
      'SET "EXE=%INSTALL_DIR%\\eagle-agent.exe"',
      "",
      "echo ============================================",
      `echo   Eagle Monitoring Agent - ${employee.name}`,
      "echo ============================================",
      'if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"',
      ":: Trust the agent's own folder with Windows Defender (installer is admin-elevated).",
      "echo Registering the agent folder with Windows Defender...",
      "powershell -NoProfile -Command \"Add-MpPreference -ExclusionPath '%INSTALL_DIR%'\" >nul 2>&1",
      "taskkill /F /IM eagle-agent.exe >nul 2>&1",
      "",
      "echo Downloading agent...",
      'where curl.exe >nul 2>&1 && curl.exe -L -o "%EXE%" "%EXE_URL%"',
      'if not exist "%EXE%" powershell -NoProfile -ExecutionPolicy Bypass -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;(New-Object Net.WebClient).DownloadFile(\'%EXE_URL%\',\'%EXE%\')}catch{exit 1}"',
      'if not exist "%EXE%" (',
      "    echo ERROR: Could not download the agent from %EXE_URL%",
      "    echo Make sure the Eagle server is reachable from this PC.",
      "    pause",
      "    exit /b 1",
      ")",
      "",
      ":: Hidden launcher (VBScript) so the agent runs with NO window — nothing to close.",
      "echo Creating background launcher...",
      'echo Set sh = CreateObject("WScript.Shell") > "%INSTALL_DIR%\\launch.vbs"',
      'echo sh.Run """%EXE%"" --server %SERVER% --token %TOKEN%", 0, False >> "%INSTALL_DIR%\\launch.vbs"',
      "",
      "echo Registering auto-start at logon...",
      'schtasks /Create /TN "EagleAgent" /TR "wscript.exe \\"%INSTALL_DIR%\\launch.vbs\\"" /SC ONLOGON /RL HIGHEST /F >nul 2>&1',
      "",
      "echo Starting agent in the background (no window)...",
      'wscript.exe "%INSTALL_DIR%\\launch.vbs"',
      "",
      "echo Done. Eagle agent is installed and running.",
      "timeout /t 4 >nul",
      "exit /b 0",
      "",
    ].join("\r\n");

    return { filename: `Eagle_${safe}_Installer.bat`, content: bat, enrollToken, server };
  }

  /** Soft on/off. Deactivating pauses the agent (dormant, data kept) and frees the seat;
   *  reactivating resumes it. Use this to offboard/replace a person without losing history. */
  async setActive(orgId: string, employeeId: string, active: boolean) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, orgId } });
    if (!employee) throw new NotFoundException("Employee not found");
    if (active && !employee.active) await this.assertSeatAvailable(orgId); // reactivating consumes a seat
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: active ? { active: true } : { active: false, status: PresenceStatus.OFFLINE },
    });
    if (!active) {
      await this.prisma.device.updateMany({
        where: { employeeId },
        data: { status: PresenceStatus.OFFLINE },
      });
    }
    return { ok: true, active };
  }

  /** Self-elevating uninstaller that fully removes the agent from a monitored PC. */
  async buildUninstaller(orgId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, orgId } });
    if (!employee) throw new NotFoundException("Employee not found");
    const safe = employee.name.replace(/[^a-z0-9]+/gi, "_");
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
      ":: Deactivate on the server first (frees the seat, keeps history) using the agent's own token.",
      "echo Deactivating on the server...",
      "powershell -NoProfile -Command \"try{ $c = Get-Content -Raw '%USERPROFILE%\\.eagle-agent\\config.json' | ConvertFrom-Json; if($c.deviceToken){ Invoke-RestMethod -Uri '%SERVER%/api/devices/deactivate' -Method Post -Headers @{ Authorization = ('Bearer ' + $c.deviceToken) } -TimeoutSec 10 | Out-Null } }catch{} \" >nul 2>&1",
      "echo Removing Eagle monitoring agent...",
      "taskkill /F /IM eagle-agent.exe >nul 2>&1",
      'schtasks /Delete /TN "EagleAgent" /F >nul 2>&1',
      "powershell -NoProfile -Command \"Remove-MpPreference -ExclusionPath '%LOCALAPPDATA%\\EagleAgent'\" >nul 2>&1",
      'rmdir /S /Q "%LOCALAPPDATA%\\EagleAgent" >nul 2>&1',
      'rmdir /S /Q "%USERPROFILE%\\.eagle-agent" >nul 2>&1',
      "echo Eagle agent removed from this PC.",
      "timeout /t 3 >nul",
      "exit /b 0",
      "",
    ].join("\r\n");
    return { filename: `Eagle_${safe}_Uninstaller.bat`, content: bat };
  }

  /** Deletes an employee, their devices, and all their data (screenshot files + rows). */
  async remove(orgId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, orgId } });
    if (!employee) throw new NotFoundException("Employee not found");
    // Delete stored screenshot files first (DB cascade removes the rows).
    const shots = await this.prisma.screenshot.findMany({
      where: { employeeId },
      select: { s3Key: true },
    });
    for (const s of shots) await this.storage.deleteImage(s.s3Key);
    // Cascades to devices, screenshots, and activity sessions.
    await this.prisma.employee.delete({ where: { id: employeeId } });
    return { ok: true, deletedScreenshots: shots.length };
  }

  async overview(orgId: string) {
    const [total, active, idle, offline] = await Promise.all([
      this.prisma.employee.count({ where: { orgId } }),
      this.prisma.employee.count({ where: { orgId, status: PresenceStatus.ACTIVE } }),
      this.prisma.employee.count({ where: { orgId, status: PresenceStatus.IDLE } }),
      this.prisma.employee.count({ where: { orgId, status: PresenceStatus.OFFLINE } }),
    ]);

    // Most-used apps in the last 24h (from activity sessions).
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const grouped = await this.prisma.activitySession.groupBy({
      by: ["name"],
      where: { orgId, startedAt: { gte: since }, isIdle: false },
      _sum: { durationSec: true },
      orderBy: { _sum: { durationSec: "desc" } },
      take: 6,
    });
    const screenshotsToday = await this.prisma.screenshot.count({
      where: { orgId, capturedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    });

    return {
      totalEmployees: total,
      active,
      idle,
      offline,
      screenshotsToday,
      mostUsedApps: grouped.map((g) => ({
        name: g.name,
        seconds: g._sum.durationSec ?? 0,
      })),
    };
  }
}
