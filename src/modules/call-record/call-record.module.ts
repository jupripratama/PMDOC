// src/modules/call-record/call-record.module.ts
import { Module, forwardRef } from '@nestjs/common';
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
    forwardRef(() => CallRecordQueueModule), // ✅ hindari circular dep
  ],
  providers: [CallRecordService],
  controllers: [CallRecordController],
  exports: [CallRecordService], // ✅ agar bisa dipakai di CsvProcessor
})
export class CallRecordModule {}
