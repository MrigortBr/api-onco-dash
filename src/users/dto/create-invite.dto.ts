import { Transform, Type } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { UserProfile } from '../../auth/profiles.js';
import { ScopeInputDto } from './scope-input.dto.js';

export class CreateInviteDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Informe o nome.' })
  @MaxLength(200)
  nome: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Informe o cargo.' })
  @MaxLength(200)
  cargo: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(254)
  email: string;

  @IsEnum(UserProfile, { message: 'Perfil inválido.' })
  profile: UserProfile;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScopeInputDto)
  escopo?: ScopeInputDto;
}
