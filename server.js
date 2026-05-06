const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const vm = require("vm");

const ROOT = __dirname;
const STORE_DIR = path.join(ROOT, "iprime-store");
const PORT = Number(process.env.PORT || 3000);
const MERCADO_PAGO_API = "https://api.mercadopago.com";

loadEnv(path.join(ROOT, ".env"));

const sessions = new Map();
const users = new Map();
const products = loadProducts();

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJSON(res, 500, { ok: false, error: error.message || "Erro interno do servidor." });
  }
});

server.listen(PORT, () => {
  console.log(`Commerce Studio rodando em http://localhost:${PORT}`);
});

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/config") {
    sendJSON(res, 200, {
      ok: true,
      mercadoPago: {
        configured: Boolean(process.env.MERCADO_PAGO_PUBLIC_KEY && process.env.MERCADO_PAGO_ACCESS_TOKEN),
        publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY || "",
      },
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/session") {
    const user = currentUser(req);
    sendJSON(res, 200, { ok: true, authenticated: Boolean(user), user: publicUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJSON(req);
    const email = normalizeEmail(body.email);
    if (!email) {
      sendJSON(res, 400, { ok: false, error: "Informe um e-mail válido." });
      return;
    }

    const user = users.get(email) || {
      id: crypto.randomUUID(),
      name: body.name || email.split("@")[0],
      email,
      phone: body.phone || "",
      createdAt: new Date().toISOString(),
    };
    users.set(email, user);
    createSession(res, user);
    sendJSON(res, 200, { ok: true, user: publicUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readJSON(req);
    const email = normalizeEmail(body.email);
    if (!body.name || !email) {
      sendJSON(res, 400, { ok: false, error: "Nome e e-mail são obrigatórios." });
      return;
    }

    const user = {
      id: crypto.randomUUID(),
      name: body.name,
      email,
      phone: body.phone || "",
      createdAt: new Date().toISOString(),
    };
    users.set(email, user);
    createSession(res, user);
    sendJSON(res, 201, { ok: true, user: publicUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const sessionId = cookies(req).commerce_session;
    if (sessionId) sessions.delete(sessionId);
    res.setHeader("Set-Cookie", "commerce_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
    sendJSON(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/payments/mercadopago") {
    const user = currentUser(req);
    if (!user) {
      sendJSON(res, 401, { ok: false, error: "Faça login antes de finalizar a compra." });
      return;
    }

    const body = await readJSON(req);
    const order = buildOrder(body, user);
    const payment = await createMercadoPagoPayment(order, body.paymentData || {});
    sendJSON(res, 200, { ok: true, ...payment, orderId: order.id, totals: order.totals });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/webhooks/mercadopago") {
    const body = await readJSON(req).catch(() => ({}));
    console.log("Webhook Mercado Pago recebido:", JSON.stringify(body));
    sendJSON(res, 200, { ok: true });
    return;
  }

  sendJSON(res, 404, { ok: false, error: "Rota de API não encontrada." });
}

async function createMercadoPagoPayment(order, paymentData) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Configure MERCADO_PAGO_ACCESS_TOKEN no arquivo .env.");
  }

  const paymentMethodId = paymentData.payment_method_id || "pix";
  const isPix = paymentMethodId === "pix";
  const payer = {
    email: order.customer.email,
    first_name: firstName(order.customer.name),
    last_name: lastName(order.customer.name),
    identification: {
      type: onlyDigits(order.customer.document).length > 11 ? "CNPJ" : "CPF",
      number: onlyDigits(order.customer.document),
    },
    phone: phoneParts(order.customer.phone),
  };

  const payload = {
    transaction_amount: Number(order.totals.total.toFixed(2)),
    description: `Pedido ${order.id} - Commerce Studio`,
    payment_method_id: paymentMethodId,
    external_reference: order.id,
    payer,
    metadata: {
      order_id: order.id,
      items: order.items.map((item) => `${item.qty}x ${item.id}`).join(", "),
    },
  };

  if (!isPix) {
    payload.token = paymentData.token;
    payload.installments = Number(paymentData.installments || 1);
    payload.issuer_id = paymentData.issuer_id || paymentData.issuerId;
    if (!payload.token) {
      throw new Error("Token seguro do cartão não recebido.");
    }
  }

  if (process.env.MERCADO_PAGO_NOTIFICATION_URL) {
    payload.notification_url = process.env.MERCADO_PAGO_NOTIFICATION_URL;
  }

  const response = await fetch(`${MERCADO_PAGO_API}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || "Mercado Pago recusou a criação do pagamento.");
  }

  const transactionData = data.point_of_interaction?.transaction_data || {};
  return {
    paymentId: data.id,
    status: data.status,
    statusDetail: data.status_detail,
    paymentType: isPix ? "pix" : data.payment_type_id || paymentData.payment_type_id || "card",
    approved: data.status === "approved",
    statusLabel: paymentStatusLabel(data),
    pix: isPix
      ? {
          qrCode: transactionData.qr_code || "",
          qrCodeBase64: transactionData.qr_code_base64 || "",
          ticketUrl: transactionData.ticket_url || "",
        }
      : null,
  };
}

function buildOrder(body, user) {
  const items = (body.cart || []).map((cartItem) => {
    const product = products.find((item) => item.id === cartItem.id);
    if (!product) throw new Error(`Produto inválido: ${cartItem.id}`);
    const qty = Math.max(1, Number(cartItem.qty || 1));
    return {
      id: product.id,
      name: product.name,
      qty,
      color: cartItem.color || "Padrão",
      storage: cartItem.storage || "Padrão",
      price: Number(product.price),
    };
  });

  if (!items.length) throw new Error("Carrinho vazio.");

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const couponValid = String(body.coupon || "").trim().toUpperCase() === "COMMERCE10";
  const discount = couponValid ? subtotal * 0.1 : 0;
  const shipping = subtotal === 0 || subtotal >= 1500 ? 0 : 39.9;
  const total = Math.max(subtotal - discount + shipping, 0);

  return {
    id: `CMS-${Date.now().toString().slice(-6)}`,
    userId: user.id,
    customer: {
      name: body.customer?.name || user.name,
      email: body.customer?.email || user.email,
      phone: body.customer?.phone || user.phone,
      document: body.customer?.document || "",
    },
    address: body.address || {},
    items,
    totals: { subtotal, discount, shipping, total },
  };
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  const baseDir = pathname.startsWith("/iprime-store/") ? ROOT : ROOT;
  const filePath = path.normalize(path.join(baseDir, pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Acesso negado.");
    return;
  }

  const target = fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
    ? path.join(filePath, "index.html")
    : filePath;

  fs.readFile(target, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Arquivo não encontrado.");
      return;
    }

    res.writeHead(200, { "Content-Type": contentType(target) });
    res.end(content);
  });
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        req.destroy();
        reject(new Error("Payload muito grande."));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("JSON inválido."));
      }
    });
    req.on("error", reject);
  });
}

function sendJSON(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function createSession(res, user) {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { userId: user.id, email: user.email, createdAt: Date.now() });
  res.setHeader("Set-Cookie", `commerce_session=${sessionId}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`);
}

function currentUser(req) {
  const sessionId = cookies(req).commerce_session;
  const session = sessionId ? sessions.get(sessionId) : null;
  return session ? users.get(session.email) : null;
}

function cookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter((pair) => pair[0])
      .map(([key, ...value]) => [key, decodeURIComponent(value.join("="))])
  );
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
  };
}

function loadProducts() {
  const source = fs.readFileSync(path.join(STORE_DIR, "assets", "js", "products.js"), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.COMMERCE_PRODUCTS || [];
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...value] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = value.join("=").replace(/^["']|["']$/g, "");
  }
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
  }[ext] || "application/octet-stream";
}

function paymentStatusLabel(data) {
  if (data.status === "approved") return "Pagamento aprovado";
  if (data.status === "pending" || data.status === "in_process") return "Pagamento em análise";
  if (data.status === "rejected") return "Pagamento recusado";
  return "Pagamento iniciado";
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function firstName(name) {
  return String(name || "Cliente").trim().split(/\s+/)[0] || "Cliente";
}

function lastName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(" ") : "Commerce";
}

function phoneParts(phone) {
  const digits = onlyDigits(phone);
  return {
    area_code: digits.slice(0, 2) || "11",
    number: digits.slice(2) || "900000000",
  };
}
