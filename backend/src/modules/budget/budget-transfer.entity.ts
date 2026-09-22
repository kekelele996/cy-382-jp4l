import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from './decimal.transformer';

@Entity('budget_transfers')
@Index('uk_budget_transfer_request', ['requestId'], { unique: true })
@Index('idx_budget_transfer_trip', ['tripId'])
export class BudgetTransferEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'request_id', length: 80 }) requestId!: string;
  @Column({ name: 'trip_id' }) tripId!: number;
  @Column({ name: 'from_category', length: 40 }) fromCategory!: string;
  @Column({ name: 'to_category', length: 40 }) toCategory!: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, transformer: decimalTransformer }) amount!: number;
  @Column({ name: 'operator_id' }) operatorId!: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
