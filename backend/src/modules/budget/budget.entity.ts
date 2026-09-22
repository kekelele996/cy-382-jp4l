import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from './decimal.transformer';

@Entity('budgets')
@Index('uk_budget_trip_category', ['tripId', 'category'], { unique: true })
export class BudgetEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'trip_id' }) tripId!: number;
  @Column({ length: 40 }) category!: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, transformer: decimalTransformer }) planned!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, transformer: decimalTransformer }) spent!: number;
}
