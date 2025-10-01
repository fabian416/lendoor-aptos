// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserModule } from './user/user.module';
import { ZkMeModule } from './zk-me/zk-me.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'database.sqlite',
      synchronize: true,
      migrationsRun: true,
      entities: [User],
      logging: ['error', 'warn'],
    }),
    UserModule,
    ZkMeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}