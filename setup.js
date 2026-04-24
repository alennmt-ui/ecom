const fs = require("fs");
const path = require("path");

const files = {
  "backend/package.json": `{
  "name": "ecommerce-backend",
  "version": "1.0.0",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "dev": "nodemon src/app.js",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:seed": "node prisma/seed.js"
  },
  "dependencies": {
    "@prisma/client": "^5.10.0",
    "bcryptjs": "^2.4.3",
    "dotenv": "^16.4.5",
    "express": "^4.18.3",
    "jsonwebtoken": "^9.0.2",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "nodemon": "^3.1.0",
    "prisma": "^5.10.0"
  }
}`,

  "backend/.env": `DATABASE_URL="postgresql://postgres:password@localhost:5432/ecommerce"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=development`,

  "backend/.env.example": `DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=development`,

  "backend/prisma/schema.prisma": `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  password  String
  role      Role     @default(employee)
  orders    Order[]
  createdAt DateTime @default(now()) @map("created_at")

  @@map("users")
}

model Product {
  id          Int         @id @default(autoincrement())
  name        String
  description String?
  price       Decimal     @db.Decimal(10, 2)
  stock       Int         @default(0)
  imageUrl    String?     @map("image_url")
  category    String?
  orderItems  OrderItem[]
  createdAt   DateTime    @default(now()) @map("created_at")

  @@map("products")
}

model Order {
  id         Int         @id @default(autoincrement())
  userId     Int         @map("user_id")
  user       User        @relation(fields: [userId], references: [id])
  totalPrice Decimal     @map("total_price") @db.Decimal(10, 2)
  status     OrderStatus @default(pending)
  items      OrderItem[]
  createdAt  DateTime    @default(now()) @map("created_at")

  @@map("orders")
}

model OrderItem {
  id        Int     @id @default(autoincrement())
  orderId   Int     @map("order_id")
  order     Order   @relation(fields: [orderId], references: [id])
  productId Int     @map("product_id")
  product   Product @relation(fields: [productId], references: [id])
  quantity  Int
  price     Decimal @db.Decimal(10, 2)

  @@map("order_items")
}

model Banner {
  id       Int     @id @default(autoincrement())
  imageUrl String  @map("image_url")
  title    String?
  link     String?

  @@map("banners")
}

model Coupon {
  id       Int      @id @default(autoincrement())
  code     String   @unique
  discount Decimal  @db.Decimal(5, 2)
  expiry   DateTime

  @@map("coupons")
}

enum Role {
  admin
  employee
}

enum OrderStatus {
  pending
  paid
  shipped
  delivered
  cancelled
}`,

  "backend/prisma/seed.js": `const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const hashed = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: { email: "admin@example.com", password: hashed, role: "admin" },
  });
  console.log("Seeded admin:", admin.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());`,

  "backend/src/app.js": `require("dotenv").config();
const express = require("express");
const errorHandler = require("./middleware/errorHandler");

const app = express();
app.use(express.json());

app.use("/auth", require("./routes/auth.routes"));
app.use("/products", require("./routes/product.routes"));
app.use("/orders", require("./routes/order.routes"));
app.use("/banners", require("./routes/banner.routes"));
app.use("/coupons", require("./routes/coupon.routes"));

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));

module.exports = app;`,

  "backend/src/config/prisma.js": `const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
module.exports = prisma;`,

  "backend/src/utils/jwt.js": `const jwt = require("jsonwebtoken");

const sign = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

const verify = (token) => jwt.verify(token, process.env.JWT_SECRET);

module.exports = { sign, verify };`,

  "backend/src/utils/AppError.js": `class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}
module.exports = AppError;`,

  "backend/src/middleware/auth.js": `const { verify } = require("../utils/jwt");
const AppError = require("../utils/AppError");

const authenticate = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(new AppError("Unauthorized", 401));
  try {
    req.user = verify(header.split(" ")[1]);
    next();
  } catch {
    next(new AppError("Invalid or expired token", 401));
  }
};

const authorize = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) return next(new AppError("Forbidden", 403));
  next();
};

module.exports = { authenticate, authorize };`,

  "backend/src/middleware/errorHandler.js": `const errorHandler = (err, _req, res, _next) => {
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.message || "Internal Server Error" });
};
module.exports = errorHandler;`,

  "backend/src/middleware/validate.js": `const AppError = require("../utils/AppError");

const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const msg = result.error.errors.map((e) => e.message).join(", ");
    return next(new AppError(msg, 400));
  }
  req.body = result.data;
  next();
};
module.exports = validate;`,

  "backend/src/models/schemas.js": `const { z } = require("zod");

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["admin", "employee"]).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  stock: z.number().int().min(0).optional(),
  imageUrl: z.string().url().optional(),
  category: z.string().optional(),
});

const orderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().positive(),
    })
  ).min(1),
  couponCode: z.string().optional(),
});

const orderStatusSchema = z.object({
  status: z.enum(["pending", "paid", "shipped", "delivered", "cancelled"]),
});

const bannerSchema = z.object({
  imageUrl: z.string().url(),
  title: z.string().optional(),
  link: z.string().optional(),
});

const couponSchema = z.object({
  code: z.string().min(1),
  discount: z.number().positive().max(100),
  expiry: z.string().datetime(),
});

module.exports = {
  registerSchema, loginSchema, productSchema,
  orderSchema, orderStatusSchema, bannerSchema, couponSchema,
};`,

  "backend/src/services/auth.service.js": `const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const { sign } = require("../utils/jwt");
const AppError = require("../utils/AppError");

const register = async ({ email, password, role }) => {
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new AppError("Email already in use", 409);
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashed, role: role || "employee" },
    select: { id: true, email: true, role: true },
  });
  return { user, token: sign({ id: user.id, role: user.role }) };
};

const login = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.password)))
    throw new AppError("Invalid credentials", 401);
  return { user: { id: user.id, email: user.email, role: user.role }, token: sign({ id: user.id, role: user.role }) };
};

module.exports = { register, login };`,

  "backend/src/services/product.service.js": `const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");

const getAll = () => prisma.product.findMany({ orderBy: { createdAt: "desc" } });

const getById = async (id) => {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new AppError("Product not found", 404);
  return product;
};

const create = (data) => prisma.product.create({ data });

const update = async (id, data) => {
  await getById(id);
  return prisma.product.update({ where: { id }, data });
};

const remove = async (id) => {
  await getById(id);
  return prisma.product.delete({ where: { id } });
};

module.exports = { getAll, getById, create, update, remove };`,

  "backend/src/services/order.service.js": `const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");

const create = async ({ items, couponCode }, userId) => {
  const productIds = items.map((i) => i.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });

  if (products.length !== productIds.length) throw new AppError("One or more products not found", 404);

  let orderItems = items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    if (product.stock < item.quantity) throw new AppError(\`Insufficient stock for \${product.name}\`, 400);
    return { productId: item.productId, quantity: item.quantity, price: product.price };
  });

  let totalPrice = orderItems.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);

  if (couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
    if (!coupon || new Date(coupon.expiry) < new Date()) throw new AppError("Invalid or expired coupon", 400);
    totalPrice = totalPrice * (1 - Number(coupon.discount) / 100);
  }

  const order = await prisma.$transaction(async (tx) => {
    for (const item of orderItems) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }
    return tx.order.create({
      data: {
        userId,
        totalPrice,
        items: { create: orderItems },
      },
      include: { items: true },
    });
  });

  return order;
};

const getAll = () => prisma.order.findMany({ include: { items: true, user: { select: { email: true } } }, orderBy: { createdAt: "desc" } });

const getById = async (id) => {
  const order = await prisma.order.findUnique({ where: { id }, include: { items: { include: { product: true } } } });
  if (!order) throw new AppError("Order not found", 404);
  return order;
};

const updateStatus = async (id, status) => {
  await getById(id);
  return prisma.order.update({ where: { id }, data: { status } });
};

module.exports = { create, getAll, getById, updateStatus };`,

  "backend/src/services/banner.service.js": `const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");

const getAll = () => prisma.banner.findMany();
const create = (data) => prisma.banner.create({ data });

const update = async (id, data) => {
  const banner = await prisma.banner.findUnique({ where: { id } });
  if (!banner) throw new AppError("Banner not found", 404);
  return prisma.banner.update({ where: { id }, data });
};

const remove = async (id) => {
  const banner = await prisma.banner.findUnique({ where: { id } });
  if (!banner) throw new AppError("Banner not found", 404);
  return prisma.banner.delete({ where: { id } });
};

module.exports = { getAll, create, update, remove };`,

  "backend/src/services/coupon.service.js": `const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");

const getAll = () => prisma.coupon.findMany();

const create = async (data) => {
  const exists = await prisma.coupon.findUnique({ where: { code: data.code } });
  if (exists) throw new AppError("Coupon code already exists", 409);
  return prisma.coupon.create({ data });
};

module.exports = { getAll, create };`,

  "backend/src/controllers/auth.controller.js": `const authService = require("../services/auth.service");

const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
};

const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) { next(err); }
};

module.exports = { register, login };`,

  "backend/src/controllers/product.controller.js": `const productService = require("../services/product.service");

const getAll = async (_req, res, next) => {
  try { res.json(await productService.getAll()); } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try { res.json(await productService.getById(Number(req.params.id))); } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try { res.status(201).json(await productService.create(req.body)); } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try { res.json(await productService.update(Number(req.params.id), req.body)); } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try { res.status(204).send(await productService.remove(Number(req.params.id))); } catch (err) { next(err); }
};

module.exports = { getAll, getById, create, update, remove };`,

  "backend/src/controllers/order.controller.js": `const orderService = require("../services/order.service");

const create = async (req, res, next) => {
  try { res.status(201).json(await orderService.create(req.body, req.user.id)); } catch (err) { next(err); }
};

const getAll = async (_req, res, next) => {
  try { res.json(await orderService.getAll()); } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try { res.json(await orderService.getById(Number(req.params.id))); } catch (err) { next(err); }
};

const updateStatus = async (req, res, next) => {
  try { res.json(await orderService.updateStatus(Number(req.params.id), req.body.status)); } catch (err) { next(err); }
};

module.exports = { create, getAll, getById, updateStatus };`,

  "backend/src/controllers/banner.controller.js": `const bannerService = require("../services/banner.service");

const getAll = async (_req, res, next) => {
  try { res.json(await bannerService.getAll()); } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try { res.status(201).json(await bannerService.create(req.body)); } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try { res.json(await bannerService.update(Number(req.params.id), req.body)); } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try { res.status(204).send(await bannerService.remove(Number(req.params.id))); } catch (err) { next(err); }
};

module.exports = { getAll, create, update, remove };`,

  "backend/src/controllers/coupon.controller.js": `const couponService = require("../services/coupon.service");

const getAll = async (_req, res, next) => {
  try { res.json(await couponService.getAll()); } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try { res.status(201).json(await couponService.create(req.body)); } catch (err) { next(err); }
};

module.exports = { getAll, create };`,

  "backend/src/routes/auth.routes.js": `const router = require("express").Router();
const ctrl = require("../controllers/auth.controller");
const validate = require("../middleware/validate");
const { registerSchema, loginSchema } = require("../models/schemas");

router.post("/register", validate(registerSchema), ctrl.register);
router.post("/login", validate(loginSchema), ctrl.login);

module.exports = router;`,

  "backend/src/routes/product.routes.js": `const router = require("express").Router();
const ctrl = require("../controllers/product.controller");
const { authenticate, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { productSchema } = require("../models/schemas");

router.get("/", ctrl.getAll);
router.get("/:id", ctrl.getById);
router.post("/", authenticate, authorize("admin"), validate(productSchema), ctrl.create);
router.put("/:id", authenticate, authorize("admin"), validate(productSchema), ctrl.update);
router.delete("/:id", authenticate, authorize("admin"), ctrl.remove);

module.exports = router;`,

  "backend/src/routes/order.routes.js": `const router = require("express").Router();
const ctrl = require("../controllers/order.controller");
const { authenticate, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { orderSchema, orderStatusSchema } = require("../models/schemas");

router.post("/", authenticate, validate(orderSchema), ctrl.create);
router.get("/", authenticate, authorize("admin"), ctrl.getAll);
router.get("/:id", authenticate, ctrl.getById);
router.put("/:id/status", authenticate, authorize("admin"), validate(orderStatusSchema), ctrl.updateStatus);

module.exports = router;`,

  "backend/src/routes/banner.routes.js": `const router = require("express").Router();
const ctrl = require("../controllers/banner.controller");
const { authenticate, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { bannerSchema } = require("../models/schemas");

router.get("/", ctrl.getAll);
router.post("/", authenticate, authorize("admin"), validate(bannerSchema), ctrl.create);
router.put("/:id", authenticate, authorize("admin"), validate(bannerSchema), ctrl.update);
router.delete("/:id", authenticate, authorize("admin"), ctrl.remove);

module.exports = router;`,

  "backend/src/routes/coupon.routes.js": `const router = require("express").Router();
const ctrl = require("../controllers/coupon.controller");
const { authenticate, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { couponSchema } = require("../models/schemas");

router.get("/", authenticate, ctrl.getAll);
router.post("/", authenticate, authorize("admin"), validate(couponSchema), ctrl.create);

module.exports = router;`,

  "backend/README.md": `# Ecommerce Backend

## Tech Stack
- Node.js + Express
- PostgreSQL + Prisma ORM
- JWT Authentication
- bcryptjs, zod, dotenv

## Setup

### 1. Install dependencies
\`\`\`bash
cd backend
npm install
\`\`\`

### 2. Configure environment
\`\`\`bash
cp .env.example .env
# Edit .env with your PostgreSQL credentials
\`\`\`

### 3. Run database migrations
\`\`\`bash
npm run db:migrate
\`\`\`

### 4. Generate Prisma client
\`\`\`bash
npm run db:generate
\`\`\`

### 5. Seed initial admin user
\`\`\`bash
npm run db:seed
# Creates: admin@example.com / admin123
\`\`\`

### 6. Start the server
\`\`\`bash
npm run dev       # development
npm start         # production
\`\`\`

## API Endpoints

### Auth
| Method | Endpoint        | Access  |
|--------|-----------------|---------|
| POST   | /auth/register  | Public  |
| POST   | /auth/login     | Public  |

### Products
| Method | Endpoint        | Access  |
|--------|-----------------|---------|
| GET    | /products       | Public  |
| GET    | /products/:id   | Public  |
| POST   | /products       | Admin   |
| PUT    | /products/:id   | Admin   |
| DELETE | /products/:id   | Admin   |

### Orders
| Method | Endpoint              | Access         |
|--------|-----------------------|----------------|
| POST   | /orders               | Authenticated  |
| GET    | /orders               | Admin          |
| GET    | /orders/:id           | Authenticated  |
| PUT    | /orders/:id/status    | Admin          |

### Banners
| Method | Endpoint        | Access  |
|--------|-----------------|---------|
| GET    | /banners        | Public  |
| POST   | /banners        | Admin   |
| PUT    | /banners/:id    | Admin   |
| DELETE | /banners/:id    | Admin   |

### Coupons
| Method | Endpoint   | Access         |
|--------|------------|----------------|
| GET    | /coupons   | Authenticated  |
| POST   | /coupons   | Admin          |

## Example .env
\`\`\`
DATABASE_URL="postgresql://postgres:password@localhost:5432/ecommerce"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=development
\`\`\`

## Example Requests

### Register
\`\`\`json
POST /auth/register
{ "email": "user@example.com", "password": "secret123" }
\`\`\`

### Login
\`\`\`json
POST /auth/login
{ "email": "admin@example.com", "password": "admin123" }
\`\`\`

### Create Order
\`\`\`json
POST /orders
Authorization: Bearer <token>
{
  "items": [{ "productId": 1, "quantity": 2 }],
  "couponCode": "SAVE10"
}
\`\`\`
`,
};

let created = 0;
for (const [filePath, content] of Object.entries(files)) {
  const fullPath = path.join(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
  console.log("Created:", filePath);
  created++;
}
console.log(`\nDone! ${created} files created.`);
console.log("\nNext steps:");
console.log("  cd backend");
console.log("  npm install");
console.log("  # Edit .env with your DB credentials");
console.log("  npm run db:migrate");
console.log("  npm run db:seed");
console.log("  npm run dev");
