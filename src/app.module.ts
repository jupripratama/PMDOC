import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CallRecordModule } from './modules/call-record/call-record.module';
import { CallRecordQueueModule } from './modules/call-record/call-record.queue.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      redis: { host: 'localhost', port: 6379 },
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI', ''),
      }),
    }),
    CallRecordModule,
    CallRecordQueueModule, // ✅ queue module terakhir
  ],
})
export class AppModule {}
