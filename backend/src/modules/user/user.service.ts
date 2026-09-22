import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { QueryFailedError, Repository } from 'typeorm';
import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../constants/errors';
import { UserEntity } from './user.entity';

@Injectable()
export class UserService {
  constructor(@InjectRepository(UserEntity) private readonly users: Repository<UserEntity>, private readonly jwt: JwtService) {}
  async register(email: string, nickname: string, password: string) {
    const user = this.users.create({ email, nickname, passwordHash: await bcrypt.hash(password, 10) });
    try {
      const saved = await this.users.save(user);
      return { id: saved.id, email: saved.email, nickname: saved.nickname };
    } catch (error) {
      if (error instanceof QueryFailedError && (error.driverError as { errno?: number })?.errno === 1062) {
        throw new AppException(ERROR_CODES.VALIDATION_FAILED, '该邮箱已注册');
      }
      throw error;
    }
  }
  async login(email: string, password: string) {
    const user = await this.users.findOneBy({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
    return { token: this.jwt.sign({ userId: user.id, nickname: user.nickname }), user: { id: user.id, nickname: user.nickname } };
  }
}
