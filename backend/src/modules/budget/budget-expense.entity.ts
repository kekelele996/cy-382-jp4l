import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from './decimal.transformer';

@Entity('budget_expenses')
@Index('uk_budget_expense_request', ['requestId'], { unique: true })
@Index('idx_budget_expense_trip', ['tripId'])
export class BudgetExpenseEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'request_id', length: 80 }) requestId!: string;
  @Column({ name: 'trip_id' }) tripId!: number;
  @Column({ length: 40 }) category!: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, transformer: decimalTransformer }) amount!: number;
  @Column({ length: 160, nullable: true }) note?: string;
  @Column({ name: 'member_id' }) memberId!: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
