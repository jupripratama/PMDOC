// call-record-queue.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { CsvProcessor } from './processors/csv.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'csv',
      redis: { host: 'localhost', port: 6379 },
    }),
  ],
  providers: [CsvProcessor],
  exports: [BullModule], // export supaya bisa di-inject di luar
})
export class CallRecordQueueModule {}
