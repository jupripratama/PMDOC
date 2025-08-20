import {
  Controller,
  Post,
  UseInterceptors,
  HttpException,
  HttpStatus,
  Query,
  Get,
  Res,
  Delete,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import dayjs from 'dayjs';
import { CallRecordService } from '../service/call-record.service';
import * as ExcelJS from 'exceljs';
import type { Response } from 'express';
import { MultiDatePipe } from 'src/common/pipes/date-format.pipe';
import {
  CleanupResponse,
  DailySummary,
  HourlyReportRow,
  UploadMultipleResponse,
  UploadFileResult,
} from '../Types/call-record.types';

@Controller('call-record')
export class CallRecordController {
  constructor(private readonly callRecordService: CallRecordService) {}

  @Post('upload-multiple')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now();
          const filename = `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, callback) => {
        if (!file.originalname.toLowerCase().endsWith('.csv')) {
          return callback(new Error('Only CSV files are allowed!'), false);
        }
        callback(null, true);
      },
    }),
  )
  async uploadMultipleCsv(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('overwrite') overwrite = 'false',
  ): Promise<UploadMultipleResponse> {
    if (!files?.length) {
      throw new HttpException('No files uploaded', HttpStatus.BAD_REQUEST);
    }

    const results: UploadFileResult[] = [];

    for (const file of files) {
      console.log(`Uploading file: ${file.originalname}`);

      const isAlreadyUploaded =
        await this.callRecordService.isFileAlreadyUploaded(file.originalname);
      const allowOverwrite = overwrite === 'true';

      if (isAlreadyUploaded && !allowOverwrite) {
        await fs.promises.unlink(file.path);
        results.push({
          file: file.originalname,
          status: 'skipped',
          reason: 'Already uploaded',
        });
        continue;
      }

      if (isAlreadyUploaded && allowOverwrite) {
        await this.callRecordService.deleteRecordsBySource(file.originalname);
      }

      try {
        // Masukkan job ke queue untuk diproses di background
        await this.callRecordService.enqueueCsvImport(
          file.path,
          file.originalname,
        );
        results.push({
          file: file.originalname,
          status: 'queued',
        });
      } catch (error) {
        // Jika terjadi error, hapus file yang di-upload
        await fs.promises.unlink(file.path);
        results.push({
          file: file.originalname,
          status: 'error',
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      summary: {
        totalFiles: results.length,
        queued: results.filter((r) => r.status === 'queued').length,
        uploaded: results.filter((r) =>
          ['uploaded', 'overwritten'].includes(r.status),
        ).length,
        skipped: results.filter((r) => r.status === 'skipped').length,
        errors: results.filter((r) => r.status === 'error').length,
      },
      details: results,
    };
  }

  @Get('report')
  getHourlyReport(@Query('date') date: string): Promise<HourlyReportRow[]> {
    if (!date) {
      throw new HttpException(
        'Date query param is required, e.g. ?date=2025-07-06',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.callRecordService.getHourlyReport(date);
  }

  @Get('summary')
  async getDailySummary(@Query('date') date: string): Promise<DailySummary> {
    if (!date) {
      throw new HttpException(
        'Date query param is required, e.g. ?date=2025-07-06',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.callRecordService.getDailySummary(date);
  }

  @Get('export')
  async exportDailySummaryToExcel(
    @Query('date') date: string,
    @Res() res: Response,
  ) {
    if (!date) {
      throw new HttpException(
        'Date query param is required, e.g. ?date=2025-07-06',
        HttpStatus.BAD_REQUEST,
      );
    }

    const hourlyReport = await this.callRecordService.getHourlyReport(date);
    const summary = await this.callRecordService.getDailySummary(date);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Summary ${date}`);

    worksheet.columns = [
      { header: 'Time', key: 'time', width: 20 },
      { header: 'Qty', key: 'qty', width: 10 },
      { header: 'TE Busy', key: 'teBusy', width: 10 },
      { header: 'TE Busy %', key: 'teBusyPercent', width: 15 },
      { header: 'Sys Busy', key: 'sysBusy', width: 10 },
      { header: 'Sys Busy %', key: 'sysBusyPercent', width: 15 },
      { header: 'Others', key: 'others', width: 10 },
      { header: 'Others %', key: 'othersPercent', width: 15 },
    ];

    hourlyReport.forEach((row) => worksheet.addRow(row));

    worksheet.addRow({
      time: 'Total',
      qty: summary.qty,
      teBusy: summary.teBusy,
      teBusyPercent: '',
      sysBusy: summary.sysBusy,
      sysBusyPercent: '',
      others: summary.others,
      othersPercent: '',
    });

    worksheet.addRow({
      time: 'Daily Average',
      teBusyPercent: summary.teBusyPercent,
      sysBusyPercent: summary.sysBusyPercent,
      othersPercent: summary.othersPercent,
    });

    worksheet.getRow(1).font = { bold: true };
    worksheet.eachRow(
      (row) => (row.alignment = { vertical: 'middle', horizontal: 'center' }),
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=daily-summary-${date}.xlsx`,
    );
    await workbook.xlsx.write(res);
    res.end();
  }

  @Get('export-multi')
  async exportMultipleSummariesToExcel(
    @Query('dates', MultiDatePipe) dates: string[],
    @Res() res: Response,
  ) {
    const workbook = new ExcelJS.Workbook();

    for (const date of dates) {
      const summary = await this.callRecordService.getDailySummary(date);
      const hourlyReport = await this.callRecordService.getHourlyReport(date);
      const sheet = workbook.addWorksheet(dayjs(date).format('DD-MM-YYYY'));

      sheet.columns = [
        { header: 'Time', key: 'time', width: 20 },
        { header: 'Qty', key: 'qty', width: 10 },
        { header: 'TE Busy', key: 'teBusy', width: 10 },
        { header: 'TE Busy %', key: 'teBusyPercent', width: 15 },
        { header: 'Sys Busy', key: 'sysBusy', width: 10 },
        { header: 'Sys Busy %', key: 'sysBusyPercent', width: 15 },
        { header: 'Others', key: 'others', width: 10 },
        { header: 'Others %', key: 'othersPercent', width: 15 },
      ];

      hourlyReport.forEach((row) => sheet.addRow(row));
      sheet.addRow({
        time: 'Total',
        qty: summary.qty,
        teBusy: summary.teBusy,
        sysBusy: summary.sysBusy,
        others: summary.others,
      });
      sheet.addRow({
        time: 'Daily Average',
        teBusyPercent: summary.teBusyPercent,
        sysBusyPercent: summary.sysBusyPercent,
        othersPercent: summary.othersPercent,
      });

      sheet.getRow(1).font = { bold: true };
      sheet.eachRow(
        (row) => (row.alignment = { vertical: 'middle', horizontal: 'center' }),
      );
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=multi-daily-summary.xlsx`,
    );
    await workbook.xlsx.write(res);
    res.end();
  }

  @Get('files')
  async listUploadedFiles() {
    return this.callRecordService.getUploadedFiles();
  }

  @Delete('cleanup')
  async cleanupOldRecords(
    @Query('months') months = 6,
  ): Promise<CleanupResponse> {
    const deletedCount = await this.callRecordService.deleteRecordsOlderThan(
      Number(months),
    );
    return {
      message: `Deleted ${deletedCount} records older than ${months} months.`,
    };
  }
}
