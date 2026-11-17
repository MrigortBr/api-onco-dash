import { Transform, Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class LoginDto {
  /** CPF / login do APAC Onco ou e-mail. */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Informe o CPF ou o e-mail.' })
  @MaxLength(255)
  login: string;

  @IsString()
  @IsNotEmpty({ message: 'Informe a senha.' })
  @MaxLength(72)
  senha: string;

  @IsString()
  @MinLength(8, { message: 'Identificador do dispositivo inválido.' })
  @MaxLength(128)
  fingerprint: string;

  /** Localização obrigatória (decisão de 13/11/2026, igual ao SIMDASH). */
  @Type(() => Number)
  @IsLatitude({ message: 'É necessário permitir a localização para entrar.' })
  latitude: number;

  @Type(() => Number)
  @IsLongitude({ message: 'Localização inválida.' })
  longitude: number;
}
