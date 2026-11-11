import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushLog } from './push-log.entity';
import { PushService } from './push.service';
import { PushController } from './push.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PushLog])],
  providers: [PushService],
  controllers: [PushController],
})
export class PushModule {}
