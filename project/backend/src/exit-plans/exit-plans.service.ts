import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExitPlanStatus, Prisma } from '@prisma/client';
import {
  decimalOutput,
  mapPrismaError,
  nonNegativeDecimalInput,
  parseDate,
} from '../common/api';
import { PrismaService } from '../database/prisma.service';
import { CreateExitPlanDto, UpdateExitPlanDto } from './exit-plans.dto';

const planInclude = {
  openingTrade: { include: { account: true, instrument: true } },
} satisfies Prisma.ExitPlanInclude;

type PlanResult = Prisma.ExitPlanGetPayload<{ include: typeof planInclude }>;

function presentPlan(plan: PlanResult) {
  return {
    ...plan,
    targetPriceMicros: undefined,
    targetPrice: decimalOutput(plan.targetPriceMicros),
    openingTrade: {
      ...plan.openingTrade,
      quantityMicros: undefined,
      priceMicros: undefined,
      feesMicros: undefined,
      quantity: decimalOutput(plan.openingTrade.quantityMicros),
      price: decimalOutput(plan.openingTrade.priceMicros),
      fees: decimalOutput(plan.openingTrade.feesMicros),
    },
  };
}

@Injectable()
export class ExitPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(status?: ExitPlanStatus) {
    const plans = await this.prisma.exitPlan.findMany({
      where: { status },
      include: planInclude,
      orderBy: { targetDate: 'asc' },
    });
    return plans.map(presentPlan);
  }

  async get(id: string) {
    const plan = await this.prisma.exitPlan.findUnique({
      where: { id },
      include: planInclude,
    });
    if (!plan) throw new NotFoundException('Exit plan not found');
    return presentPlan(plan);
  }

  async create(dto: CreateExitPlanDto) {
    try {
      const plan = await this.prisma.exitPlan.create({
        data: {
          openingTradeId: dto.openingTradeId,
          targetPriceMicros: nonNegativeDecimalInput(
            dto.targetPrice,
            'targetPrice',
          ),
          targetDate: parseDate(dto.targetDate, 'targetDate'),
          rationale: dto.rationale.trim(),
        },
        include: planInclude,
      });
      return presentPlan(plan);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('exit plans require')
      ) {
        throw new ConflictException(error.message);
      }
      mapPrismaError(error, 'Exit plan');
    }
  }

  async update(id: string, dto: UpdateExitPlanDto) {
    try {
      const plan = await this.prisma.exitPlan.update({
        where: { id },
        data: {
          ...(dto.targetPrice === undefined
            ? {}
            : {
                targetPriceMicros: nonNegativeDecimalInput(
                  dto.targetPrice,
                  'targetPrice',
                ),
              }),
          ...(dto.targetDate === undefined
            ? {}
            : { targetDate: parseDate(dto.targetDate, 'targetDate') }),
          ...(dto.rationale === undefined
            ? {}
            : { rationale: dto.rationale.trim() }),
          ...(dto.status === undefined ? {} : { status: dto.status }),
        },
        include: planInclude,
      });
      return presentPlan(plan);
    } catch (error) {
      mapPrismaError(error, 'Exit plan');
    }
  }

  cancel(id: string) {
    return this.update(id, { status: ExitPlanStatus.CANCELLED });
  }
}
