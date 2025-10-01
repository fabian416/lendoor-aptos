// submit-zk-passport.dto.ts
import { IsString, IsNotEmpty, IsOptional, Allow } from 'class-validator';

export class SubmitZkMeDto {
  @IsString() walletAddress: string;
  @IsString() requestId: string;
  @IsNotEmpty() proof: unknown;

  @Allow() 
  @IsOptional()
  result?: Record<string, any>;
}