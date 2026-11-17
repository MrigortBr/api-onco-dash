import { Transform } from 'class-transformer';
import { IsHexadecimal, IsNotEmpty, IsString, Length, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ForgotPasswordDto {
  /** CPF / login ou e-mail; o link vai para o e-mail cadastrado na conta. */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Informe o CPF ou o e-mail.' })
  @MaxLength(255)
  login: string;
}

export class ResetPasswordDto {
  @IsHexadecimal({ message: 'Link inválido.' })
  @Length(64, 64, { message: 'Link inválido.' })
  token: string;

  @IsString()
  @MinLength(8, { message: 'A senha precisa ter pelo menos 8 caracteres.' })
  @MaxLength(72, { message: 'A senha pode ter no máximo 72 caracteres.' })
  senha: string;
}
