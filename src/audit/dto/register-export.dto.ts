import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

class ExportAbaDto {
  @IsString() @MinLength(1) @MaxLength(120)
  nome: string;

  @IsInt() @Min(0)
  linhas: number;
}

export class RegisterExportDto {
  @IsString() @MinLength(1) @MaxLength(300)
  pagina: string;

  @IsString() @MinLength(1) @MaxLength(200)
  arquivo: string;

  @IsIn(['csv', 'xlsx', 'pdf', 'png', 'svg'])
  formato: string;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => ExportAbaDto)
  abas?: ExportAbaDto[];
}
