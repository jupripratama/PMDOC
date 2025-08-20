import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class MultiDatePipe implements PipeTransform {
  transform(value: string | string[]): string[] {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string') {
      return value.split(',').map((v) => v.trim());
    }

    throw new BadRequestException('Invalid date format');
  }
}
