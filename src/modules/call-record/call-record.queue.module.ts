// src/modules/call-record/call-record.queue.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { CsvProcessor } from './processors/csv.processor';
import { CallRecordModule } from './call-record.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'csv',
      redis: { host: 'localhost', port: 6379 },
    }),
    forwardRef(() => CallRecordModule), // ✅ supaya bisa inject CallRecordService
  ],
  providers: [CsvProcessor],
  exports: [BullModule], // biar queue bisa dipakai di luar
})
export class CallRecordQueueModule {}
