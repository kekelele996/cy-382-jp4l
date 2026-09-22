import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('trip_expenses')
@Unique('uk_trip_expense_idem', ['tripId', 'idempotencyKey'])
export class ExpenseEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'trip_id' }) tripId!: number;
  @Column({ length: 20 }) category!: string;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount!: number;
  @Column({ nullable: true }) note?: string;
  @Column({ name: 'member_id', nullable: true }) memberId?: number;
  @Column({ name: 'member_name', length: 80 }) memberName!: string;
  @Column({ name: 'idempotency_key', length: 64 }) idempotencyKey!: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
