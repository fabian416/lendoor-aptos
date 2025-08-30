// dto/submit-zk-passport.dto.ts
import { IsString, IsNotEmpty, ValidateNested, IsArray, IsOptional, Allow } from 'class-validator';
import { Type } from 'class-transformer';

class VerificationDto {
  @IsArray() proofs: any[];
  @Allow() @IsOptional() queryResult?: Record<string, any>;
}

export class SubmitZkPassportDto {
  @IsString() walletAddress: string;
  @IsString() requestId: string;

  @ValidateNested()
  @Type(() => VerificationDto)
  verification: VerificationDto;
}
