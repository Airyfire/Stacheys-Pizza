/*  Stachey's Pizza — local dev server
    Run with:  node server.js
    Then open: http://localhost:3001
               http://localhost:3001/admin.html
*/

require('dotenv').config();

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const PORT = 3001;

// ── Stripe Setup ──
const STRIPE_SECRET    = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PUB_KEY   = process.env.STRIPE_PUBLISHABLE_KEY || '';
let stripe = null;
if (STRIPE_SECRET && !STRIPE_SECRET.includes('REPLACE')) {
  stripe = require('stripe')(STRIPE_SECRET);
  console.log('  ✓ Stripe initialized (test mode)');
} else {
  console.log('  ⚠ Stripe keys not configured — online payments disabled.');
  console.log('    Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in .env');
}

// ── Orders Store ──
const ORDERS_PATH = path.join(__dirname, 'orders.json');

function loadOrders() {
  try {
    return JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveOrders(orders) {
  fs.writeFileSync(ORDERS_PATH, JSON.stringify(orders, null, 2), 'utf8');
}

const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── Helpers ──
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify(data));
}

function parseUrl(url) {
  const [pathname, qs] = url.split('?');
  const params = {};
  if (qs) {
    qs.split('&').forEach(p => {
      const [k, v] = p.split('=');
      params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
  }
  return { pathname, params };
}

// ═══════════════════════════════════════════
//  SERVER
// ═══════════════════════════════════════════
const server = http.createServer(async (req, res) => {
  console.log(`[${req.method}] ${req.url}`);
  const { pathname, params } = parseUrl(req.url);

  // ── CORS pre-flight ──
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // ══════════════════════════════════════
  //  POST /api/save  →  write site-data.json
  // ══════════════════════════════════════
  if (req.method === 'POST' && pathname === '/api/save') {
    const body = await readBody(req);
    try {
      const parsed = JSON.parse(body);
      const dataPath = path.join(__dirname, 'site-data.json');
      fs.writeFile(dataPath, JSON.stringify(parsed, null, 2), 'utf8', err => {
        if (err) {
          console.error('Write error:', err);
          jsonResponse(res, 500, { ok: false, error: err.message });
          return;
        }
        console.log('✓ site-data.json saved');
        jsonResponse(res, 200, { ok: true });
      });
    } catch (e) {
      console.error('JSON parse error:', e);
      jsonResponse(res, 400, { ok: false, error: 'Invalid JSON' });
    }
    return;
  }

  // ══════════════════════════════════════
  //  POST /api/create-checkout-session
  //  Creates a Stripe Checkout session
  // ══════════════════════════════════════
  if (req.method === 'POST' && pathname === '/api/create-checkout-session') {
    if (!stripe) {
      jsonResponse(res, 500, { ok: false, error: 'Stripe not configured. Add keys to .env file.' });
      return;
    }
    const body = await readBody(req);
    try {
      const { items, customer, orderType, deliveryAddress } = JSON.parse(body);

      if (!items || !items.length) {
        jsonResponse(res, 400, { ok: false, error: 'Cart is empty' });
        return;
      }

      // Build Stripe line items
      const lineItems = items.map(item => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            description: item.meta || item.ingredients || '',
          },
          unit_amount: Math.round(item.price * 100), // cents
        },
        quantity: 1,
      }));

      // Add delivery fee if applicable
      if (orderType === 'delivery') {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: { name: 'Delivery Fee' },
            unit_amount: 400, // $4.00
          },
          quantity: 1,
        });
      }

      // Generate a pending order ID
      const orderId = 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();

      // Store pending order metadata in the session
      const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || `http://localhost:${PORT}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${origin}/api/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/menu.html`,
        metadata: {
          orderId,
          customerName: `${customer.firstName} ${customer.lastName}`.trim(),
          customerPhone: customer.phone,
          orderType,
          deliveryAddress: deliveryAddress || '',
          itemsJson: JSON.stringify(items),
        },
      });

      jsonResponse(res, 200, { ok: true, url: session.url, orderId });
    } catch (e) {
      console.error('Stripe session error:', e);
      jsonResponse(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // ══════════════════════════════════════
  //  GET /api/checkout-success
  //  Stripe redirects here after payment
  // ══════════════════════════════════════
  if (req.method === 'GET' && pathname === '/api/checkout-success') {
    const sessionId = params.session_id;
    if (!sessionId || !stripe) {
      res.writeHead(302, { Location: '/index.html' });
      res.end();
      return;
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const meta = session.metadata || {};

      // Avoid duplicate orders
      const orders = loadOrders();
      const alreadyExists = orders.some(o => o.stripeSessionId === sessionId);
      if (!alreadyExists) {
        const items = JSON.parse(meta.itemsJson || '[]');
        const total = items.reduce((s, i) => s + (parseFloat(i.price) || 0), 0)
                      + (meta.orderType === 'delivery' ? 4 : 0);

        const order = {
          id: meta.orderId || 'ORD-' + Date.now().toString(36).toUpperCase(),
          items,
          customer: {
            name: meta.customerName || 'Guest',
            phone: meta.customerPhone || '',
          },
          orderType: meta.orderType || 'pickup',
          deliveryAddress: meta.deliveryAddress || '',
          status: 'new',
          total: Math.round(total * 100) / 100,
          createdAt: new Date().toISOString(),
          stripeSessionId: sessionId,
          paymentStatus: session.payment_status,
        };

        orders.unshift(order);
        saveOrders(orders);
        console.log(`✓ New order saved: ${order.id} — $${order.total}`);
      }

      // Redirect to success page
      res.writeHead(302, {
        Location: `/checkout-success.html?order_id=${encodeURIComponent(meta.orderId || '')}`,
      });
      res.end();
    } catch (e) {
      console.error('Checkout success error:', e);
      res.writeHead(302, { Location: '/index.html' });
      res.end();
    }
    return;
  }

  // ══════════════════════════════════════
  //  POST /api/orders/place  (non-Stripe fallback — cash orders)
  // ══════════════════════════════════════
  if (req.method === 'POST' && pathname === '/api/orders/place') {
    const body = await readBody(req);
    try {
      const { items, customer, orderType, deliveryAddress, paymentMethod } = JSON.parse(body);

      if (!items || !items.length) {
        jsonResponse(res, 400, { ok: false, error: 'Cart is empty' });
        return;
      }

      const total = items.reduce((s, i) => s + (parseFloat(i.price) || 0), 0)
                    + (orderType === 'delivery' ? 4 : 0);

      const orderId = 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();

      const order = {
        id: orderId,
        items,
        customer: {
          name: `${customer.firstName} ${customer.lastName}`.trim(),
          phone: customer.phone,
        },
        orderType: orderType || 'pickup',
        deliveryAddress: deliveryAddress || '',
        status: 'new',
        total: Math.round(total * 100) / 100,
        createdAt: new Date().toISOString(),
        stripeSessionId: null,
        paymentStatus: paymentMethod === 'cash' ? 'pay_on_arrival' : 'pending',
      };

      const orders = loadOrders();
      orders.unshift(order);
      saveOrders(orders);
      console.log(`✓ Cash order saved: ${order.id} — $${order.total}`);

      jsonResponse(res, 200, { ok: true, orderId });
    } catch (e) {
      console.error('Order place error:', e);
      jsonResponse(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // ══════════════════════════════════════
  //  GET /api/orders
  //  Returns all orders for the admin dashboard
  // ══════════════════════════════════════
  if (req.method === 'GET' && pathname === '/api/orders') {
    const orders = loadOrders();
    jsonResponse(res, 200, { ok: true, orders });
    return;
  }

  // ══════════════════════════════════════
  //  POST /api/orders/update-status
  //  Body: { orderId, status }
  // ══════════════════════════════════════
  if (req.method === 'POST' && pathname === '/api/orders/update-status') {
    const body = await readBody(req);
    try {
      const { orderId, status } = JSON.parse(body);
      const validStatuses = ['new', 'preparing', 'ready', 'completed'];
      if (!validStatuses.includes(status)) {
        jsonResponse(res, 400, { ok: false, error: 'Invalid status' });
        return;
      }
      const orders = loadOrders();
      const order = orders.find(o => o.id === orderId);
      if (!order) {
        jsonResponse(res, 404, { ok: false, error: 'Order not found' });
        return;
      }
      order.status = status;
      if (status === 'completed') {
        order.completedAt = new Date().toISOString();
      }
      saveOrders(orders);
      console.log(`✓ Order ${orderId} → ${status}`);
      jsonResponse(res, 200, { ok: true, order });
    } catch (e) {
      console.error('Status update error:', e);
      jsonResponse(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // ══════════════════════════════════════
  //  GET /api/config
  //  Returns public config (Stripe publishable key)
  // ══════════════════════════════════════
  if (req.method === 'GET' && pathname === '/api/config') {
    jsonResponse(res, 200, {
      stripePublishableKey: STRIPE_PUB_KEY || null,
      stripeEnabled: !!stripe,
    });
    return;
  }

  // ══════════════════════════════════════
  //  GET  →  static files
  // ══════════════════════════════════════
  if (req.method === 'GET') {
    let urlPath = pathname;
    if (urlPath === '/') urlPath = '/index.html';

    // Security: prevent directory traversal
    const safe = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
    const abs  = path.join(__dirname, safe);

    fs.stat(abs, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain', ...CORS });
        res.end('404 Not Found: ' + safe);
        return;
      }
      const mime = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, ...CORS });
      fs.createReadStream(abs).pipe(res);
    });
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ┌──────────────────────────────────────────────┐');
  console.log(`  │   Stachey's server running                   │`);
  console.log(`  │   Site:   http://localhost:${PORT}               │`);
  console.log(`  │   Admin:  http://localhost:${PORT}/admin.html    │`);
  console.log('  └──────────────────────────────────────────────┘');
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✗ Port ${PORT} is already in use.\n  Stop the other process or change PORT at the top of server.js.\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});