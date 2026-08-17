import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class RegisterDto {
  @IsString() @MinLength(2) orgName!: string;
  @IsString() @MinLength(2) ownerName!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
}

export class ForgotDto {
  @IsEmail() email!: string;
}

export class ResetDto {
  @IsString() token!: string;
  @IsString() @MinLength(6) password!: string;
}
