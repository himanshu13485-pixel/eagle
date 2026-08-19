import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** Payload from the public contact form on the marketing site. */
export class ContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  teamSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reason?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message!: string;
}
