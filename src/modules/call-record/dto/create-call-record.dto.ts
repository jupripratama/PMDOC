// src/modules/call-record/dto/create-call-record.dto.ts
import { IsString, IsNumber } from 'class-validator';

export class CreateCallRecordDto {
  @IsString()
  date: string;

  @IsNumber()
  hour: number;

  @IsString()
  time: string;

  @IsNumber()
  closeReason: number;

  @IsString()
  source: string;
}
