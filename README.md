# 旅伴匹配与行程共享平台

帮助用户发布旅行计划、匹配旅伴、协作规划行程并在旅途中实时沟通。

## 快速启动

```bash
cp .env.example .env
docker compose up -d --build
```

访问地址：前端 http://localhost:18402 ，后端 http://localhost:19402/health 。

## 项目主要功能

- 发布包含目的地、时间、预算、交通方式和旅伴偏好的行程。
- 根据目的地、时间和预算做旅伴匹配评分。
- 行程协作看板维护每日安排、住宿和交通方案。
- 预算管理展示计划费用和实际花费。
- 行程协作看板支持**分类预算调拨**：按交通、住宿、餐饮、门票设置分类额度（合计不超过总预算）；成员登记费用只扣对应分类，超出剩余额度整笔拒绝并返回可登记上限；发起人可在分类间调拨剩余额度（调出后不低于已用金额）。费用登记与调拨均通过 `requestId` 幂等 + 数据库行锁/唯一索引保证只生效一次，页面展示各类额度、已用与剩余，刷新后一致。
- Socket.IO 支持行程成员即时聊天。
- 旅行日记和用户主页为后续扩展预留清晰模块。

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
│       ├── common
│       ├── constants
│       ├── config
│       └── modules
├── database
├── frontend
│   └── src
└── docker-compose.yml
```

## 环境变量说明

### 分类预算接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/trips/:tripId/budget` | 查询各分类额度、已用、剩余及合计 |
| PUT | `/api/trips/:tripId/budget` | 发起人设置/调整四类额度（合计不超过总预算、不低于已用） |
| POST | `/api/trips/:tripId/budget/expenses` | 成员登记费用，只扣对应分类；超额整笔拒绝，响应中返回 `maxAmount` 可登记上限 |
| POST | `/api/trips/:tripId/budget/transfers` | 发起人调拨分类剩余额度，响应中返回 `maxTransferable` 可调拨上限 |

费用登记与调拨请求体必须携带唯一 `requestId`：重复或并发提交只成功一次（返回 `duplicate: true`），同一 `requestId` 参数不一致返回 `BUDGET_REQUEST_CONFLICT`。

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
