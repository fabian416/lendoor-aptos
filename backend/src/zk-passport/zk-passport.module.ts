import { Module } from '@nestjs/common';
import { ZkPassportService } from './zk-passport.service';
import { ZkPassportController } from './zk-passport.controller';

@Module({
  providers: [ZkPassportService],
  controllers: [ZkPassportController]
})
export class ZkPassportModule {}
