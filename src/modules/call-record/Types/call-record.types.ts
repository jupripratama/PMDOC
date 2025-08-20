export interface UploadFileResult {
  file: string;
  status: 'skipped' | 'error' | 'uploaded' | 'overwritten' | 'queued'; // tambah 'queued'
  reason?: string;
  recordsInserted?: number;
  invalidLog?: string;
}

export interface UploadSummary {
  totalFiles: number;
  queued?: number; // tambah queued, buat hitung job yang antri
  uploaded: number;
  skipped: number;
  errors: number;
  totalRecordsInserted?: number;
}

export interface UploadMultipleResponse {
  summary: {
    totalFiles: number;
    queued: number;
    uploaded: number;
    skipped: number;
    errors: number;
  };
  details: UploadFileResult[];
}

export interface HourlyReportRow {
  time: string;
  qty: number;
  teBusy: number;
  teBusyPercent: string;
  sysBusy: number;
  sysBusyPercent: string;
  others: number;
  othersPercent: string;
}

export interface DailySummary {
  date: string;
  qty: number;
  teBusy: number;
  teBusyPercent: string;
  sysBusy: number;
  sysBusyPercent: string;
  others: number;
  othersPercent: string;
}

export interface CleanupResponse {
  message: string;
}
