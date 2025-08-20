import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { BadRequestException } from '@nestjs/common';

dayjs.extend(customParseFormat);

/**
 * Parse string ke dayjs dengan format DD-MM-YYYY secara strict.
 */
export function parseDate(dateString: string) {
  const parsed = dayjs(dateString, 'DD-MM-YYYY', true);
  if (!parsed.isValid()) {
    throw new BadRequestException(
      `Invalid date format: ${dateString}. Expected format: DD-MM-YYYY`,
    );
  }
  return parsed;
}

/**
 * Ubah dari format YYYYMMDD (misal dari CSV) ke format DD-MM-YYYY.
 */
export function formatCsvDate(rawDate: string) {
  if (!/^\d{8}$/.test(rawDate)) {
    throw new BadRequestException(
      `Invalid CSV date format: ${rawDate}. Expected format: YYYYMMDD`,
    );
  }
  return `${rawDate.slice(6, 8)}-${rawDate.slice(4, 6)}-${rawDate.slice(0, 4)}`;
}
