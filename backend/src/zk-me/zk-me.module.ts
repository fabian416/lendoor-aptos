import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ZkMeService } from './zk-me.service';
import { ZkMeController } from './zk-me.controller';
import { User } from 'src/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [ZkMeService],
  controllers: [ZkMeController]
})
export class ZkMeModule {}
