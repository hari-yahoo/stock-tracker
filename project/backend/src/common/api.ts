import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatScaledDecimal, parseScaledDecimal } from './money';

export function decimalInput(value: string, field: string): bigint {
  try {
    return parseScaledDecimal(value);
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error
        ? `${field}: ${error.message}`
        : `${field} is invalid`,
    );
  }
}

export function positiveDecimalInput(value: string, field: string): bigint {
  const parsed = decimalInput(value, field);
  if (parsed <= 0n) throw new BadRequestException(`${field} must be positive`);
  return parsed;
}

export function nonNegativeDecimalInput(value: string, field: string): bigint {
  const parsed = decimalInput(value, field);
  if (parsed < 0n) throw new BadRequestException(`${field} cannot be negative`);
  return parsed;
}

export function decimalOutput(value: bigint): string {
  return formatScaledDecimal(value);
}

export function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

export function parseDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be a valid ISO 8601 date`);
  }
  return date;
}

export function mapPrismaError(error: unknown, resource: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      throw new ConflictException(`${resource} already exists`);
    }
    if (error.code === 'P2003' || error.code === 'P2014') {
      throw new ConflictException(`${resource} is referenced by other records`);
    }
    if (error.code === 'P2025') {
      throw new NotFoundException(`${resource} not found`);
    }
  }
  throw error;
}
