import { IsEnum, IsIn, IsOptional, IsString } from "class-validator";
import { DevicePlatform, PresenceStatus } from "@eagle/shared";

export class EnrollDto {
  @IsString()
  token!: string;

  @IsString()
  hostname!: string;

  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @IsString()
  agentVersion!: string;
}

export class HeartbeatDto {
  @IsIn([PresenceStatus.ACTIVE, PresenceStatus.IDLE, PresenceStatus.OFFLINE])
  status!: PresenceStatus;

  @IsOptional()
  @IsString()
  activeApp?: string | null;

  @IsOptional()
  @IsString()
  activeUrl?: string | null;
}
