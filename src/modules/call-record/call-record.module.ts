// call-record.module.ts
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { MongooseModule } from '@nestjs/mongoose';
import { CallRecordService } from './service/call-record.service';
import { CallRecordController } from './controller/call-record.controller';
import { CallRecord, CallRecordSchema } from './schemas/call-record.schema';
import { CallRecordQueueModule } from './call-record.queue.module';

@Module({
  imports: [
    CacheModule.register({ ttl: 60 }),
    MongooseModule.forFeature([
      { name: CallRecord.name, schema: CallRecordSchema },
    ]),
    CallRecordQueueModule, // ✅ biar CallRecordService bisa inject @InjectQueue('csv')
  ],
  providers: [CallRecordService],
  controllers: [CallRecordController],
})
export class CallRecordModule {}
