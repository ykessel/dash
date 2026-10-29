import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('workspaces')
export class Workspace {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ type: 'text' }) name: string
  @Column({ type: 'text', unique: true }) slug: string
  @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy: string | null
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
}
