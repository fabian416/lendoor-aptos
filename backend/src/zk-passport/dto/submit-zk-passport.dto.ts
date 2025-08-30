import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SubmitZkPassportDto {
  @IsString()
  @IsNotEmpty()
  walletAddress!: string;

  @IsString()
  @IsOptional()
  requestId?: string;

  // La prueba cruda del SDK (estructura opaca para nosotros)
  proof!: unknown;

  // Resultado con disclosures (lo mapeamos a User)
  // Tip: podés tiparlo mejor si tenés el shape del SDK
  result?: Record<string, any>;
}
