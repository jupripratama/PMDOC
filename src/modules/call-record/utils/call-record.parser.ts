import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as readline from 'readline';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCallRecordDto } from '../dto/create-call-record.dto';
import { CallRecordService } from '../service/call-record.service';
import * as path from 'path';
import dayjs from 'dayjs';

type FailedLine = {
  line: string;
  reason: string;
};

export async function parseCsvToCallRecordsInBatches(
  filePath: string,
  service: CallRecordService,
  sourceFilename: string,
): Promise<{ totalInserted: number; logPath: string | null }> {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const failedLines: FailedLine[] = [];
  let batch: CreateCallRecordDto[] = [];
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

      // Validasi dan format tanggal
      if (!/^\d{8}$/.test(rawDate)) {
        failedLines.push({ line, reason: 'Invalid date format' });
        continue;
      }
      const date = dayjs(rawDate, 'YYYYMMDD').format('DD-MM-YYYY');

      // Parsing jam
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
        source: sourceFilename,
      };

      const dto = plainToInstance(CreateCallRecordDto, record);
      const errors = await validate(dto);

      if (errors.length > 0) {
        const reasons = errors
          .map((e) => Object.values(e.constraints || {}).join(', '))
          .join('; ');
        failedLines.push({ line, reason: `DTO validation failed: ${reasons}` });
        continue;
      }

      batch.push(dto);

      if (batch.length >= 1000) {
        await service.bulkInsert(batch);
        totalInserted += batch.length;
        batch = []; // Reset batch setelah disisipkan
      }
    } catch (error) {
      failedLines.push({
        line,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  if (batch.length > 0) {
    await service.bulkInsert(batch);
    totalInserted += batch.length;
  }

  // Simpan log error jika ada
  let logPath: string | null = null;
  if (failedLines.length > 0) {
    const logsDir = path.join('uploads', 'logs');
    await fsPromises.mkdir(logsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    logPath = path.join(logsDir, `invalid-rows-${timestamp}.log`);

    const content = failedLines
      .map((f) => `Reason: ${f.reason}\nLine: ${f.line}\n`)
      .join('\n');

    await fsPromises.writeFile(logPath, content, 'utf-8');
    console.warn(
      `⚠️  ${failedLines.length} invalid lines written to: ${logPath}`,
    );
  }

  return {
    totalInserted,
    logPath: failedLines.length > 0 ? logPath : null,
  };
}
