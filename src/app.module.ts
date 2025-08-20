// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';

import { CallRecordModule } from './modules/call-record/call-record.module';
import { CallRecordQueueModule } from './modules/call-record/call-record.queue.module';

@Module({
  imports: [
    // ✅ Config .env
    ConfigModule.forRoot({ isGlobal: true }),

    // ✅ MongoDB Connection
    MongooseModule.forRoot(
      process.env.MONGO_URI || 'mongodb://localhost:27017/test',
    ),

    // ✅ Redis / Bull Global Setup
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),

    // ✅ Feature Modules
    CallRecordModule,
    CallRecordQueueModule,
  ],
})
export class AppModule {}
