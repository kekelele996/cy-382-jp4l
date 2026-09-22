import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('trip_budget_categories')
@Unique('uk_trip_category', ['tripId', 'category'])
export class BudgetCategoryEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'trip_id' }) tripId!: number;
  @Column({ length: 20 }) category!: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) quota!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) used!: number;
}
