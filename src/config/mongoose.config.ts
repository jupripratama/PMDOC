// app.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CallRecordModule } from 'src/modules/call-record/call-record.module';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: 'mongodb://127.0.0.1:27017/PMMKN',
      }),
    }),
    CallRecordModule,
  ],
})
export class AppModule {}
