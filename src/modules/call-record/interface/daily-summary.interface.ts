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

// hourly-report.interface.ts
export interface HourlyReport {
  time: string; // format misal "08:00 - 09:00"
  qty: number;
  teBusy: number;
  teBusyPercent: string;
  sysBusy: number;
  sysBusyPercent: string;
  others: number;
  othersPercent: string;
}
