import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        req.user = this.jwt.verify(token);
      } catch {
        // 未携带有效令牌时保持匿名身份，业务层按 operatorId 兜底识别操作人
      }
    }
    return true;
  }
}
