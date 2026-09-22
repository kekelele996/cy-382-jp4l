import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { BudgetService } from './budget.service';

@Controller('api/trips')
export class BudgetController {
  constructor(private readonly service: BudgetService) {}

  @Get(':tripId/budget')
  overview(@Param('tripId') tripId: string) {
    return this.service.overview(Number(tripId));
  }

  @Put(':tripId/budget/categories')
  @UseGuards(JwtGuard)
  setQuotas(@Param('tripId') tripId: string, @Req() req: { user: { userId: number } }, @Body() body: { quotas?: Record<string, unknown> }) {
    return this.service.setQuotas(Number(tripId), req.user.userId, body?.quotas ?? {});
  }

  @Post(':tripId/expenses')
  @UseGuards(JwtGuard)
  registerExpense(@Param('tripId') tripId: string, @Req() req: { user: { userId: number; nickname: string } }, @Body() body: unknown) {
    return this.service.registerExpense(Number(tripId), req.user, (body ?? {}) as Record<string, unknown>);
  }

  @Post(':tripId/budget/transfers')
  @UseGuards(JwtGuard)
  transfer(@Param('tripId') tripId: string, @Req() req: { user: { userId: number } }, @Body() body: unknown) {
    return this.service.transfer(Number(tripId), req.user.userId, (body ?? {}) as Record<string, unknown>);
  }
}
