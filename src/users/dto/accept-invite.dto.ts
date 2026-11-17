import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @IsString()
  @MinLength(8, { message: 'A senha precisa ter pelo menos 8 caracteres.' })
  @MaxLength(72, { message: 'A senha pode ter no máximo 72 caracteres.' })
  senha: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @IsString()
  @Matches(/^\d{11}$/, { message: 'Informe um CPF válido (11 dígitos).' })
  cpf: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[\d\s()+-]{10,20}$/, { message: 'Informe um telefone válido com DDD.' })
  telefone: string;
}
