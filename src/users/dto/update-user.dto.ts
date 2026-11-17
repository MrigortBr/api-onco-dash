import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { UserProfile } from '../../auth/profiles.js';
import { ScopeInputDto } from './scope-input.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Edição de usuário (só Desenvolvedor e Gestor federal). Campos ausentes não mudam. */
export class UpdateUserDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200)
  nome?: string;

  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200)
  cargo?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(30)
  telefone?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(254)
  email?: string;

  @IsOptional() @IsEnum(UserProfile, { message: 'Perfil inválido.' })
  profile?: UserProfile;

  @IsOptional() @IsBoolean()
  canEdit?: boolean;

  @IsOptional() @IsBoolean()
  canAdd?: boolean;

  /** Quando enviado, substitui o escopo inteiro. */
  @IsOptional() @ValidateNested() @Type(() => ScopeInputDto)
  escopo?: ScopeInputDto;
}
