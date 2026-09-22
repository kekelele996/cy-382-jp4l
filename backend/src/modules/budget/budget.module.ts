import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripEntity } from '../trip/trip.entity';
import { BudgetController } from './budget.controller';
import { BudgetService } from './budget.service';
import { BudgetCategoryEntity } from './entities/budget-category.entity';
import { BudgetTransferEntity } from './entities/budget-transfer.entity';
import { ExpenseEntity } from './entities/expense.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BudgetCategoryEntity, ExpenseEntity, BudgetTransferEntity, TripEntity]),
    JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev_secret' })
  ],
  controllers: [BudgetController],
  providers: [BudgetService]
})
export class BudgetModule {}
