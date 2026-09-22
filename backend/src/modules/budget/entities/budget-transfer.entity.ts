import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('trip_budget_transfers')
@Unique('uk_trip_transfer_idem', ['tripId', 'idempotencyKey'])
export class BudgetTransferEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'trip_id' }) tripId!: number;
  @Column({ name: 'from_category', length: 20 }) fromCategory!: string;
  @Column({ name: 'to_category', length: 20 }) toCategory!: string;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount!: number;
  @Column({ name: 'operator_id' }) operatorId!: number;
  @Column({ name: 'idempotency_key', length: 64 }) idempotencyKey!: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
