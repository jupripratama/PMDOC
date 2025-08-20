import { Processor, Process } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { CallRecordService } from '../service/call-record.service';
import * as fs from 'fs';
import * as readline from 'readline';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as path from 'path';
import { CreateCallRecordDto } from '../dto/create-call-record.dto';
import dayjs from 'dayjs';

@Processor('csv')
@Injectable()
export class CsvProcessor {
  private readonly logger = new Logger(CsvProcessor.name);

  constructor(private readonly callRecordService: CallRecordService) {}

  // Pastikan nama job konsisten dengan yang di enqueue
  @Process('import')
  async handleImport(job: Job<{ filePath: string; filename: string }>) {
    this.logger.log(`Starting import for file: ${job.data.filename}`);

    try {
      const { totalInserted, logPath } =
        await this.callRecordService.parseCsvToCallRecordsInBatches(
          job.data.filePath,
          job.data.filename,
        );

      this.logger.log(`Parsed CSV. Total records inserted: ${totalInserted}`);

      await fs.promises.unlink(job.data.filePath); // Menghapus file setelah diproses

      return { status: 'success', totalInserted, logPath };
    } catch (error) {
      this.logger.error(`Failed to process file: ${job.data.filename}`, error);
      throw error;
    }
  }

  // Fungsi parsing CSV dan insert ke database
  private async parseCsvToCallRecordsInBatches(
    filePath: string,
    filename: string,
  ) {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    const failedLines: { line: string; reason: string }[] = [];
    const batch: CreateCallRecordDto[] = [];
    let totalInserted = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;

      const columns = line.split(',');

      if (columns.length < 3) {
        failedLines.push({ line, reason: 'Too few columns' });
        continue;
      }

      try {
        const rawDate = columns[0];
        const rawTime = columns[1];
        const closeReasonRaw = columns[columns.length - 2];

        if (!/^\d{8}$/.test(rawDate)) {
          failedLines.push({ line, reason: 'Invalid date format' });
          continue;
        }

        const date = dayjs(rawDate, 'YYYYMMDD').format('DD-MM-YYYY');
        let hour: number;

        if (/^\d{6}$/.test(rawTime)) {
          hour = parseInt(rawTime.slice(0, 2), 10);
        } else if (/^\d{2}:\d{2}:\d{2}$/.test(rawTime)) {
          hour = parseInt(rawTime.split(':')[0], 10);
        } else {
          failedLines.push({ line, reason: 'Invalid time format' });
          continue;
        }

        const closeReason = parseInt(closeReasonRaw, 10);

        const record = {
          date,
          hour,
          time: rawTime,
          closeReason,
          source: filename,
        };
        const dto = plainToInstance(CreateCallRecordDto, record);
        const errors = await validate(dto);

        if (errors.length > 0) {
          const reasons = errors
            .map((e) => Object.values(e.constraints || {}).join(', '))
            .join('; ');

          failedLines.push({
            line,
            reason: `DTO validation failed: ${reasons}`,
          });
          continue;
        }

        batch.push(dto);

        // Insert batch setiap 1000 record
        if (batch.length >= 1000) {
          await this.callRecordService.bulkInsert(batch);
          totalInserted += batch.length;
          batch.length = 0; // Reset batch
        }
      } catch (error) {
        failedLines.push({
          line,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Insert batch terakhir
    if (batch.length > 0) {
      await this.callRecordService.bulkInsert(batch);
      totalInserted += batch.length;
    }

    let logPath: string | null = null;
    if (failedLines.length > 0) {
      const logsDir = path.join('uploads', 'logs');
      await fs.promises.mkdir(logsDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      logPath = path.join(logsDir, `invalid-rows-${timestamp}.log`);
      const content = failedLines
        .map((f) => `Reason: ${f.reason}\nLine: ${f.line}\n`)
        .join('\n');
      await fs.promises.writeFile(logPath, content, 'utf-8');
    }

    this.logger.log(
      `Parsing complete. Total records inserted: ${totalInserted}`,
    );
    return { totalInserted, logPath };
  }
}
