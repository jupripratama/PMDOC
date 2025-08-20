// src/modules/call-record/service/call-record.service.ts
import { Model } from 'mongoose';
import { CallRecord, CallRecordDocument } from '../schemas/call-record.schema';
import { CreateCallRecordDto } from '../dto/create-call-record.dto';
import { DailySummary } from '../interface/daily-summary.interface';
import { HourlyReportRow } from '../Types/call-record.types';
import * as fs from 'fs'; // Untuk membaca file CSV
import * as readline from 'readline'; // Untuk membaca file CSV baris per baris
import { plainToInstance } from 'class-transformer'; // Untuk mentransformasi objek ke DTO
import { validate } from 'class-validator'; // Untuk validasi DTO
import * as path from 'path'; // Untuk bekerja dengan path file dan folder
import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Cache } from 'cache-manager';
import { parseDate } from '../utils/date';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import dayjs from 'dayjs';
import type { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';

@Injectable()
export class CallRecordService {
  private readonly logger = new Logger(CallRecordService.name);

  constructor(
    @InjectModel(CallRecord.name)
    private callRecordModel: Model<CallRecordDocument>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectQueue('csv') private csvQueue: Queue, // <-- Inject queue
  ) {}

  // =========================
  // Fungsi utama: enqueue job import
  // =========================
  async enqueueCsvImport(filePath: string, filename: string): Promise<string> {
    // Cek file sudah pernah di-upload
    const alreadyUploaded = await this.isFileAlreadyUploaded(filename);
    if (alreadyUploaded) {
      throw new Error(`File ${filename} sudah pernah di-upload.`);
    }

    const job = await this.csvQueue.add(
      'import', // Nama job harus sama dengan yang ada di processor
      { filePath, filename },
      {
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 3, // retry 3x jika gagal
        backoff: { type: 'fixed', delay: 5000 }, // delay 5 detik tiap retry
      },
    );

    this.logger.log(`Job enqueued for file: ${filename}, jobId: ${job.id}`);
    return `Job ${job.id} untuk file ${filename} berhasil dimasukkan ke queue.`;
  }

  // =========================
  // Cek file sudah ada di DB
  // =========================
  async isFileAlreadyUploaded(filename: string): Promise<boolean> {
    const record = await this.callRecordModel
      .findOne({ source: filename })
      .lean();
    return !!record;
  }

  async parseCsvToCallRecordsInBatches(filePath: string, filename: string) {
    const fileStream = fs.createReadStream(filePath);
    this.logger.log(`Starting to parse file: ${filename}`);
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
        const date =
          rawDate.slice(6, 8) +
          '-' +
          rawDate.slice(4, 6) +
          '-' +
          rawDate.slice(0, 4); // Format tanggal

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

        if (batch.length >= 1000) {
          await this.bulkInsert(batch);
          totalInserted += batch.length;
          batch.length = 0;
        }
      } catch (error) {
        failedLines.push({
          line,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Insert remaining batch
    if (batch.length > 0) {
      await this.bulkInsert(batch);
      totalInserted += batch.length;
    }

    // Log failed lines if any
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
      this.logger.warn(
        `⚠️  ${failedLines.length} invalid lines written to: ${logPath}`,
      );
    }

    this.logger.log(
      `Parsing complete. Total records inserted: ${totalInserted}`,
    );
    return { totalInserted, logPath };
  }

  // =========================
  // Fungsi batch insert
  // =========================
  async bulkInsert(records: CreateCallRecordDto[]): Promise<number> {
    try {
      this.logger.log(`Inserting ${records.length} records into DB...`);
      const result = await this.callRecordModel.insertMany(records);
      this.logger.log(`Inserted ${result.length} records successfully.`);
      return result.length;
    } catch (error) {
      this.logger.error('Error inserting records into DB:', error);
      throw error;
    }
  }

  async deleteRecordsBySource(source: string): Promise<void> {
    await this.callRecordModel.deleteMany({ source });
  }

  // Contoh metode processData
  async processData(): Promise<string> {
    // Implementasi pemrosesan data yang memakan waktu
    // Misalnya memproses file atau data
    return new Promise((resolve) => {
      setTimeout(() => resolve('Data processed successfully!'), 2000); // Simulasi pemrosesan data
    });
  }

  // Tambahkan metode processWithTimeout di dalam kelas
  async processWithTimeout() {
    try {
      const result = await Promise.race([
        this.processData(), // Fungsi yang memakan waktu
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout!')), 60000),
        ), // Timeout 60 detik
      ]);
      return result;
    } catch (error) {
      // Pastikan error adalah instance dari Error
      if (error instanceof Error) {
        throw new Error(`Process failed: ${error.message}`);
      } else {
        // Jika bukan instance Error, tangani dengan cara yang lebih generik
        throw new Error('Process failed: Unknown error');
      }
    }
  }

  // untuk get by jam
  async getHourlyReport(date: string): Promise<HourlyReportRow[]> {
    const cacheKey = `hourly:${date}`;
    const cached = await this.cacheManager.get<HourlyReportRow[]>(cacheKey);

    if (cached) {
      return cached;
    }

    const formattedDate = parseDate(date).format('DD-MM-YYYY');
    const records = await this.callRecordModel.find({ date: formattedDate });

    const report: HourlyReportRow[] = Array.from({ length: 24 }, (_, hour) => {
      const filtered = records.filter((r) => r.hour === hour);

      const qty = filtered.length;
      const teBusy = filtered.filter((r) => r.closeReason === 0).length;
      const sysBusy = filtered.filter((r) => r.closeReason === 1).length;
      const others = filtered.filter((r) =>
        [2, 3, 4, 5, 6, 7, 8, 9, 10].includes(r.closeReason),
      ).length;

      const formatPercent = (value: number) =>
        qty > 0 ? `${((value / qty) * 100).toFixed(2)}%` : '0.00%';

      return {
        time: `${hour.toString().padStart(2, '0')}.00 - ${hour
          .toString()
          .padStart(2, '0')}.59`,
        qty,
        teBusy,
        teBusyPercent: formatPercent(teBusy),
        sysBusy,
        sysBusyPercent: formatPercent(sysBusy),
        others,
        othersPercent: formatPercent(others),
      };
    });

    await this.cacheManager.set(cacheKey, report, 60 * 10);
    return report;
  }

  // untuk get detail summary
  async getDailySummary(date: string): Promise<DailySummary> {
    const cacheKey = `summary:${date}`;
    const cached = await this.cacheManager.get<DailySummary>(cacheKey);

    if (cached) {
      return cached;
    }

    const formattedDate = parseDate(date).format('DD-MM-YYYY'); // ✅ pastikan sama dengan DB
    const records = await this.callRecordModel.find({ date: formattedDate });

    const totalQty = records.length;
    const totalTeBusy = records.filter((r) => r.closeReason === 0).length;
    const totalSysBusy = records.filter((r) => r.closeReason === 1).length;
    const totalOthers = totalQty - totalTeBusy - totalSysBusy;

    const formatPercent = (value: number) =>
      totalQty > 0 ? `${((value / totalQty) * 100).toFixed(2)}%` : '0.00%';

    const result: DailySummary = {
      date: formattedDate,
      qty: totalQty,
      teBusy: totalTeBusy,
      teBusyPercent: formatPercent(totalTeBusy),
      sysBusy: totalSysBusy,
      sysBusyPercent: formatPercent(totalSysBusy),
      others: totalOthers,
      othersPercent: formatPercent(totalOthers),
    };

    await this.cacheManager.set(cacheKey, result, 60 * 10);
    return result;
  }

  async insertRecords(records: any[]): Promise<number> {
    const result = await this.callRecordModel.insertMany(records);
    return result.length;
  }

  // =========================
  // Utility: get uploaded files
  // =========================
  async getUploadedFiles(): Promise<any[]> {
    const results = await this.callRecordModel.aggregate([
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 },
          firstDate: { $min: '$date' },
          lastDate: { $max: '$date' },
          uploadedAt: { $min: '$createdAt' },
        },
      },
      {
        $project: {
          _id: 0,
          source: '$_id',
          count: 1,
          firstDate: 1,
          lastDate: 1,
          uploadedAt: 1,
        },
      },
      { $sort: { uploadedAt: -1 } },
    ]);
    return results;
  }

  async deleteRecordsOlderThan(months: number): Promise<number> {
    const cutoffDate = dayjs().subtract(months, 'month').format('DD-MM-YYYY');

    const result = await this.callRecordModel.deleteMany({
      date: { $lt: cutoffDate },
    });

    return result.deletedCount ?? 0;
  }
}
