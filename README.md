# 旅伴匹配与行程共享平台

帮助用户发布旅行计划、匹配旅伴、协作规划行程并在旅途中实时沟通。

## 快速启动

```bash
cp .env.example .env
docker compose up -d --build
```

访问地址：前端 http://localhost:18402 ，后端 http://localhost:19402/health 。

内置演示数据：账号 `demo@tripmatch.cn` / `demo123456`（行程「大理」发起人，含四个分类的预算额度），登录后可在「协作看板」中体验费用登记与分类额度调拨。

## 项目主要功能

- 发布包含目的地、时间、预算、交通方式和旅伴偏好的行程。
- 根据目的地、时间和预算做旅伴匹配评分。
- 行程协作看板维护每日安排、住宿和交通方案。
- 分类预算管理：行程按交通/住宿/餐饮/门票设置分类额度，合计不得超过总预算；成员登记费用只扣减对应分类，超出该分类剩余额度整笔拒绝并返回可登记上限；发起人可在分类间调拨剩余额度（调出后不得低于已用金额）；登记与调拨基于幂等键和数据库事务保证重复或并发操作只生效一次。
- Socket.IO 支持行程成员即时聊天。
- 旅行日记和用户主页为后续扩展预留清晰模块。

## 预算接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/trips/:id/budget | 预算总览：各分类额度、已用、剩余及费用/调拨记录 |
| PUT | /api/trips/:id/budget/categories | 设置分类额度（仅发起人，合计 ≤ 总预算且不低于已用） |
| POST | /api/trips/:id/expenses | 登记费用（需登录，携带 idempotencyKey 幂等键） |
| POST | /api/trips/:id/budget/transfers | 分类间调拨（仅发起人，携带 idempotencyKey 幂等键） |

## 本地开发方式

```bash
cd backend
npm install
npm run start:dev
```

```bash
cd frontend
npm install
npm run dev
```

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 18、TypeScript、Ant Design、Vite、高德地图 JS API |
| 后端 | NestJS、TypeScript、TypeORM、JWT、Socket.IO |
| 数据库 | MySQL 8.0 |
| 部署 | Docker Compose、Nginx |

## 项目目录结构

```text
.
├── backend
│   └── src
│       ├── common        # 守卫、过滤器、异常、日志
│       ├── constants     # 错误码、状态与预算分类常量
│       ├── config
│       └── modules
│           ├── budget    # 分类预算：额度、费用登记、调拨
│           ├── trip
│           ├── user
│           └── ...
├── database
│   └── init.sql          # 表结构（与 TypeORM 实体对齐）与演示数据
├── frontend
│   └── src
│       ├── components    # BudgetBoard、ExpenseForm、TransferForm 等
│       └── types
└── docker-compose.yml
```

## 环境变量说明

| 变量 | 说明 |
| --- | --- |
| COMPOSE_PROJECT_NAME | Compose 项目名，默认 tripmatch |
| DATABASE_HOST | MySQL 服务主机名 |
| DATABASE_NAME | 数据库名称 |
| DATABASE_USER | 数据库用户 |
| JWT_SECRET | JWT 签名密钥 |
| AMAP_KEY | 高德地图 JS API Key |

## Docker 部署说明

- 前端端口：`18402:80`
- 后端端口：`19402:3000`
- MySQL 数据通过命名卷 `tripmatch-db-data` 持久化。
- Nginx 同时代理 `/api` 与 `/socket.io`，支持 WebSocket Upgrade。

## License

MIT
