import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserJourneyModule } from './user-journey/user-journey.module';
import { ZkPassportModule } from './zk-passport/zk-passport.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'database.sqlite',
      autoLoadEntities: true,
      synchronize: true,
    }),
    UserJourneyModule,
    ZkPassportModule,
  ],
  controllers: [],
  providers: [AppService],
})
export class AppModule {}
