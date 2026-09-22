import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { OptionalJwtGuard } from '../../common/guards/optional-jwt.guard';
import { BudgetService } from './budget.service';

interface AuthedRequest {
  user?: { userId?: number };
}

@Controller('api/trips')
@UseGuards(OptionalJwtGuard)
export class BudgetController {
  constructor(private readonly service: BudgetService) {}

  @Put(':tripId/budget')
  setup(
    @Param('tripId') tripId: string,
    @Body() body: { quotas?: Record<string, number>; operatorId?: number },
    @Req() req: AuthedRequest
  ) {
    return this.service.setup(
      Number(tripId),
      body.quotas ?? {},
      this.resolveOperator(req, body.operatorId)
    );
  }

  @Get(':tripId/budget')
  summary(@Param('tripId') tripId: string) {
    return this.service.getSummary(Number(tripId));
  }

  @Post(':tripId/budget/expenses')
  register(
    @Param('tripId') tripId: string,
    @Body() body: { category: string; amount: number; note?: string; memberId?: number; requestId: string },
    @Req() req: AuthedRequest
  ) {
    return this.service.registerExpense({
      tripId: Number(tripId),
      category: body.category,
      amount: Number(body.amount),
      note: body.note,
      memberId: this.resolveOperator(req, body.memberId),
      requestId: body.requestId
    });
  }

  @Post(':tripId/budget/transfers')
  transfer(
    @Param('tripId') tripId: string,
    @Body() body: { fromCategory: string; toCategory: string; amount: number; operatorId?: number; requestId: string },
    @Req() req: AuthedRequest
  ) {
    return this.service.transfer({
      tripId: Number(tripId),
      fromCategory: body.fromCategory,
      toCategory: body.toCategory,
      amount: Number(body.amount),
      operatorId: this.resolveOperator(req, body.operatorId),
      requestId: body.requestId
    });
  }

  private resolveOperator(req: AuthedRequest, fallback?: number) {
    return Number(req.user?.userId ?? fallback ?? NaN);
  }
}
