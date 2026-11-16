import "dotenv/config";
import cors from "cors";
import crypto from "node:crypto";
import fs from "node:fs";
import express from "express";
import mysql from "mysql2/promise";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

const app = express();
const port = Number(process.env.PORT || 3000);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.join(currentDirectory, "dist");
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "ecomerce",
  waitForConnections: true,
  connectionLimit: 10,
});
const adminTokenSecret = process.env.ADMIN_TOKEN_SECRET;
if (!adminTokenSecret) {
  throw new Error("ADMIN_TOKEN_SECRET must be set before starting the API");
}
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

app.use(cors());
app.post(
  "/api/payments/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
      return response.status(503).send("Stripe webhook is not configured");
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        request.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      console.error("Stripe webhook signature failed:", error.message);
      return response.status(400).send("Invalid webhook signature");
    }
    try {
      if (
        event.type === "payment_intent.succeeded" ||
        event.type === "payment_intent.payment_failed"
      ) {
        const intent = event.data.object;
        const status =
          event.type === "payment_intent.succeeded" ? "paid" : "failed";
        await pool.execute(
          "UPDATE payments SET status = ?, paid_at = IF(? = 'paid', NOW(), paid_at), failure_reason = ? WHERE provider_payment_id = ?",
          [status, status, intent.last_payment_error?.message || null, intent.id],
        );
        if (event.type === "payment_intent.succeeded") {
          await pool.execute(
            "UPDATE orders SET status = 'paid' WHERE id = ?",
            [intent.metadata.orderId],
          );
        }
      }
      return response.json({ received: true });
    } catch (error) {
      console.error("Stripe webhook processing failed:", error.message);
      return response.status(500).send("Webhook processing failed");
    }
  },
);
app.use(express.json({ limit: "1mb" }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) =>
    callback(null, file.mimetype.startsWith("image/")),
});

function toProduct(row) {
  const { image_data: imageData, ...product } = row;
  return {
    ...product,
    price: Number(row.price),
    oldPrice: row.old_price === null ? null : Number(row.old_price),
    discount: Number(row.discount || 0),
    stock: Number(row.stock || 0),
    offerEndsAt: row.offer_ends_at,
    imageUrl: imageData ? `/api/products/${row.id}/image` : row.image_url,
  };
}

function verifyPassword(password, storedHash) {
  const [algorithm, salt, expectedHash] = String(storedHash).split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHash) return false;
  const actualHash = crypto.scryptSync(password, salt, 64).toString("hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const actualBuffer = Buffer.from(actualHash, "hex");
  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function createAdminToken(admin) {
  const payload = Buffer.from(
    JSON.stringify({
      id: Number(admin.id),
      role: admin.role,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", adminTokenSecret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function requireAdmin(request, response, next) {
  const token = request.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return response.status(401).json({ message: "Admin login required" });
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return response.status(401).json({ message: "Invalid admin token" });
  }
  const expectedSignature = crypto
    .createHmac("sha256", adminTokenSecret)
    .update(payload)
    .digest("base64url");
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return response.status(401).json({ message: "Invalid admin token" });
  }
  try {
    const admin = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (admin.role !== "admin" || admin.expiresAt <= Date.now()) {
      return response.status(403).json({ message: "Admin access required" });
    }
    request.admin = admin;
    return next();
  } catch {
    return response.status(401).json({ message: "Invalid admin token" });
  }
}

function requireStaff(request, response, next) {
  const token = request.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return response.status(401).json({ message: "Staff login required" });
  }
  const [payload, signature] = token.split(".");
  const expectedSignature = crypto
    .createHmac("sha256", adminTokenSecret)
    .update(payload || "")
    .digest("base64url");
  const suppliedBuffer = Buffer.from(signature || "");
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    !payload ||
    !signature ||
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return response.status(401).json({ message: "Invalid staff token" });
  }
  try {
    const staff = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      !["admin", "order_manager"].includes(staff.role) ||
      staff.expiresAt <= Date.now()
    ) {
      return response.status(403).json({ message: "Order staff access required" });
    }
    request.admin = staff;
    return next();
  } catch {
    return response.status(401).json({ message: "Invalid staff token" });
  }
}

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ ok: true, database: "connected" });
  } catch {
    response.status(503).json({ ok: false, database: "unavailable" });
  }
});

app.post("/api/admin/login", async (request, response) => {
  const email = String(request.body?.email || "").trim().toLowerCase();
  const password = String(request.body?.password || "");
  if (!email || !password) {
    return response.status(400).json({ message: "Email and password are required" });
  }
  try {
    const [rows] = await pool.execute(
      "SELECT id, email, password_hash, role FROM admin_users WHERE email = ? AND is_active = 1",
      [email],
    );
    const admin = rows[0];
    if (!admin || !verifyPassword(password, admin.password_hash)) {
      return response.status(401).json({ message: "Invalid admin credentials" });
    }
    await pool.execute(
      "UPDATE admin_users SET last_login_at = NOW() WHERE id = ?",
      [admin.id],
    );
    response.json({
      token: createAdminToken(admin),
      admin: { id: Number(admin.id), email: admin.email, role: admin.role },
    });
  } catch (error) {
    console.error("Admin login failed:", error.message);
    response.status(500).json({ message: "Could not log in" });
  }
});

app.get("/api/products", async (request, response) => {
  try {
    const limit = Math.min(Math.max(Number(request.query.limit) || 48, 1), 100);
    const page = Math.max(Number(request.query.page) || 1, 1);
    const offset = (page - 1) * limit;
    const search = String(request.query.search || "").trim();
    const category = String(request.query.category || "").trim();
    const filters = ["is_active = 1"];
    const values = [];
    if (search) {
      filters.push("name LIKE ?");
      values.push(`%${search}%`);
    }
    if (category) {
      filters.push("category = ?");
      values.push(category);
    }
    const [rows] = await pool.query(
      `SELECT id, name, category, price, old_price, discount, offer, unit,
        stock, emoji, image_url, image_data, offer_ends_at
       FROM grocery WHERE ${filters.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    );
    response.json({ items: rows.map(toProduct), page, limit });
  } catch (error) {
    console.error("Product fetch failed:", error.message);
    response.status(500).json({ message: "Could not load products" });
  }
});

app.get("/api/admin/orders", requireStaff, async (_request, response) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, status, currency, subtotal, delivery_fee, total,
        delivery_address, delivery_latitude, delivery_longitude, created_at
       FROM orders ORDER BY created_at DESC LIMIT 100`,
    );
    response.json({ orders: rows });
  } catch (error) {
    console.error("Order dashboard fetch failed:", error.message);
    response.status(500).json({ message: "Could not load orders" });
  }
});

app.patch("/api/admin/orders/:id/status", requireStaff, async (request, response) => {
  const allowedStatuses = new Set([
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ]);
  const status = String(request.body?.status || "");
  const id = Number(request.params.id);
  if (!allowedStatuses.has(status) || !Number.isSafeInteger(id) || id < 1) {
    return response.status(400).json({ message: "Invalid order status" });
  }
  try {
    const [result] = await pool.execute(
      "UPDATE orders SET status = ? WHERE id = ?",
      [status, id],
    );
    if (!result.affectedRows) {
      return response.status(404).json({ message: "Order not found" });
    }
    response.json({ message: "Order status updated", status });
  } catch (error) {
    console.error("Order status update failed:", error.message);
    response.status(500).json({ message: "Could not update order status" });
  }
});

app.post("/api/orders", async (request, response) => {
  if (!stripe) {
    return response.status(503).json({
      message: "Online payments are not configured. Set STRIPE_SECRET_KEY.",
    });
  }
  const {
    items,
    address,
    latitude = null,
    longitude = null,
  } = request.body || {};
  const normalizedItems = Array.isArray(items)
    ? items
        .map((item) => ({
          id: Number(item.id),
          quantity: Number(item.quantity),
        }))
        .filter(
          (item) =>
            Number.isInteger(item.id) &&
            Number.isInteger(item.quantity) &&
            item.quantity > 0,
        )
    : [];
  const numericLatitude = latitude === null ? null : Number(latitude);
  const numericLongitude = longitude === null ? null : Number(longitude);

  if (
    !normalizedItems.length ||
    typeof address !== "string" ||
    address.trim().length < 5 ||
    (numericLatitude !== null &&
      (!Number.isFinite(numericLatitude) ||
        numericLatitude < -90 ||
        numericLatitude > 90)) ||
    (numericLongitude !== null &&
      (!Number.isFinite(numericLongitude) ||
        numericLongitude < -180 ||
        numericLongitude > 180))
  ) {
    return response
      .status(400)
      .json({ message: "A valid cart and delivery address are required" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const productIds = [...new Set(normalizedItems.map((item) => item.id))];
    const placeholders = productIds.map(() => "?").join(",");
    const [products] = await connection.query(
      `SELECT id, name, price, stock FROM grocery WHERE is_active = 1 AND id IN (${placeholders}) FOR UPDATE`,
      productIds,
    );
    const productMap = new Map(
      products.map((product) => [Number(product.id), product]),
    );
    const lines = normalizedItems.map((item) => {
      const product = productMap.get(item.id);
      if (!product || Number(product.stock) < item.quantity)
        throw new Error("STOCK_UNAVAILABLE");
      const unitPrice = Number(product.price);
      return {
        ...item,
        product,
        unitPrice,
        lineTotal: unitPrice * item.quantity,
      };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const deliveryFee = subtotal >= 35 ? 0 : 3.5;
    const total = subtotal + deliveryFee;
    const [orderResult] = await connection.execute(
      `INSERT INTO orders (subtotal, delivery_fee, total, delivery_address, delivery_latitude, delivery_longitude)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        subtotal,
        deliveryFee,
        total,
        address.trim(),
        numericLatitude,
        numericLongitude,
      ],
    );
    for (const line of lines) {
      await connection.execute(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, line_total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          orderResult.insertId,
          line.product.id,
          line.product.name,
          line.unitPrice,
          line.quantity,
          line.lineTotal,
        ],
      );
      await connection.execute(
        "UPDATE grocery SET stock = stock - ? WHERE id = ?",
        [line.quantity, line.product.id],
      );
    }
    let paymentIntent;
    if (stripe) {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(total * 100),
        currency: "nzd",
        automatic_payment_methods: { enabled: true },
        metadata: { orderId: String(orderResult.insertId) },
      });
      await connection.execute(
        `INSERT INTO payments
          (order_id, provider, provider_payment_id, status, amount, currency)
         VALUES (?, 'stripe', ?, 'pending', ?, 'NZD')`,
        [orderResult.insertId, paymentIntent.id, total],
      );
    }
    await connection.commit();
    response.status(201).json({
      orderId: orderResult.insertId,
      status: "awaiting_payment",
      currency: "NZD",
      subtotal: Number(subtotal.toFixed(2)),
      deliveryFee,
      total: Number(total.toFixed(2)),
      clientSecret: paymentIntent?.client_secret || null,
    });
  } catch (error) {
    await connection.rollback();
    if (error.message === "STOCK_UNAVAILABLE") {
      return response
        .status(409)
        .json({
          message: "One or more items are no longer available in that quantity",
        });
    }
    console.error("Order creation failed:", error.message);
    response.status(500).json({ message: "Could not create order" });
  } finally {
    connection.release();
  }
});

app.get("/api/products/:id/image", async (request, response) => {
  try {
    const [rows] = await pool.execute(
      "SELECT image_data, image_mime_type FROM grocery WHERE id = ?",
      [request.params.id],
    );
    if (!rows[0]?.image_data) return response.sendStatus(404);
    response
      .type(rows[0].image_mime_type || "application/octet-stream")
      .send(rows[0].image_data);
  } catch {
    response.sendStatus(500);
  }
});

app.post(
  "/api/products",
  requireAdmin,
  upload.single("image"),
  async (request, response) => {
  const {
    name,
    category,
    price,
    oldPrice,
    discount = 0,
    offer = null,
    unit,
    stock = 0,
    emoji = "📦",
    imageUrl = null,
    offerEndsAt = null,
  } = request.body;
  const numericPrice = Number(price);
  const numericOldPrice = oldPrice ? Number(oldPrice) : null;
  const numericDiscount = Number(discount);
  const numericStock = Number(stock);
  const salePrice =
    numericOldPrice !== null && numericDiscount > 0
      ? Number(
          (numericOldPrice * (1 - numericDiscount / 100)).toFixed(2),
        )
      : numericPrice;

  if (
    !name ||
    !category ||
    !unit ||
    !Number.isFinite(numericPrice) ||
    numericPrice < 0 ||
    (numericOldPrice !== null &&
      (!Number.isFinite(numericOldPrice) || numericOldPrice < salePrice)) ||
    !Number.isFinite(numericDiscount) ||
    numericDiscount < 0 ||
    numericDiscount > 100 ||
    !Number.isInteger(numericStock) ||
    numericStock < 0
  ) {
    return response.status(400).json({ message: "Invalid product details" });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO grocery
        (name, category, price, old_price, discount, offer, unit, stock, emoji, image_url, image_data, image_mime_type, offer_ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        category,
        salePrice,
        numericOldPrice,
        numericDiscount,
        offer || null,
        unit.trim(),
        numericStock,
        emoji,
        imageUrl,
        request.file?.buffer || null,
        request.file?.mimetype || null,
        offerEndsAt || null,
      ],
    );
    const [rows] = await pool.execute("SELECT * FROM grocery WHERE id = ?", [
      result.insertId,
    ]);
    response.status(201).json(toProduct(rows[0]));
  } catch (error) {
    console.error("Product create failed:", error.message);
    response.status(500).json({ message: "Could not save product" });
  }
  },
);

app.delete("/api/products/:id", requireAdmin, async (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return response.status(400).json({ message: "Invalid product id" });
  }
  try {
    const [result] = await pool.execute(
      "UPDATE grocery SET is_active = FALSE WHERE id = ? AND is_active = TRUE",
      [id],
    );
    if (!result.affectedRows) {
      return response.status(404).json({ message: "Product not found" });
    }
    response.json({ message: "Product archived" });
  } catch (error) {
    console.error("Product archive failed:", error.message);
    response.status(500).json({ message: "Could not archive product" });
  }
});

if (fs.existsSync(frontendDirectory)) {
  app.use(express.static(frontendDirectory));
  app.use((request, response, next) => {
    if (request.method !== "GET" || request.path.startsWith("/api")) {
      return next();
    }
    return response.sendFile(path.join(frontendDirectory, "index.html"));
  });
}

app.listen(port, () =>
  console.log(`API server listening on http://localhost:${port}`),
);
