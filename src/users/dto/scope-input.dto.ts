import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() || undefined : value);

/**
 * Escopo territorial informado no convite/edição: código + nome de cada nível.
 * Sem tabelas de território próprias — as opções da tela saem dos dados do
 * painel; aqui só se valida o formato.
 */
export class ScopeInputDto {
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{2}$/, { message: 'UF inválida (use a sigla, ex.: PE).' })
  ufCodigo?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  ufNome?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(20)
  macrorregiaoCodigo?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  macrorregiaoNome?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(20)
  regiaoSaudeCodigo?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  regiaoSaudeNome?: string;

  @IsOptional() @Transform(trim) @Matches(/^\d{6,7}$/, { message: 'Código IBGE do município inválido (6 ou 7 dígitos).' })
  municipioCodigo?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  municipioNome?: string;

  @IsOptional() @Transform(trim) @Matches(/^\d{7}$/, { message: 'CNES inválido (7 dígitos).' })
  cnesCodigo?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  cnesNome?: string;
}
