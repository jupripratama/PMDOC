import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class CallRecord {
  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  hour: number;

  @Prop({ required: true })
  time: string;

  @Prop({ required: true })
  closeReason: number;

  @Prop({ required: true })
  source: string;
}

export const CallRecordSchema = SchemaFactory.createForClass(CallRecord);

export type CallRecordDocument = CallRecord & Document;
