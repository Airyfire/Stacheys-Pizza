/*  Stachey's Pizza — local dev server with security updates
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

// ── Admin Password Setup ──
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'StacheysPizza2026';
if (!process.env.ADMIN_PASSWORD) {
  console.warn('  ⚠ WARNING: ADMIN_PASSWORD environment variable not set.');
  console.warn('    Using default fallback password: StacheysPizza2026');
  console.warn('    Please configure ADMIN_PASSWORD in a .env file for production.');
}

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

// ── Site Data Store ──
function loadSiteData() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'site-data.json'), 'utf8'));
  } catch (e) {
    console.error('Error loading site data:', e);
    return null;
  }
}

// ── Active Sessions ──
const activeSessions = new Set();

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
  'Access-Control-Allow-Headers': 'Content-Type, Cookie',
  'Access-Control-Allow-Credentials': 'true',
};

// ── Helpers ──
function readBody(req, limit = 102400) { // Limit default to 100KB
  return new Promise((resolve, reject) => {
    let body = '';
    let bytesReceived = 0;
    req.on('data', chunk => {
      bytesReceived += chunk.length;
      if (bytesReceived > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
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

function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    if (name) {
      list[name] = decodeURIComponent(value);
    }
  });
  return list;
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  const token = cookies.session_token;
  return token && activeSessions.has(token);
}

// ── Price Recalculation / Verification ──
function verifyItemsAndCalculateTotal(items, orderType) {
  const siteData = loadSiteData();
  if (!siteData) throw new Error('Site data unavailable');

  let total = 0;
  for (const item of items) {
    if (item.name === 'Custom 12" Pie' || item.name.includes('Custom')) {
      // Recalculate custom pizza price
      let itemPrice = siteData.customizerBasePrice || 16;
      if (item.meta) {
        const selectedToppings = item.meta.split(' · ');
        selectedToppings.forEach(toppingName => {
          let found = false;
          for (const cat of siteData.customizerCategories || []) {
            const top = cat.toppings.find(t => t.name.toLowerCase() === toppingName.toLowerCase());
            if (top) {
              itemPrice += top.price;
              found = true;
              break;
            }
          }
          if (!found) {
            console.warn(`Custom topping "${toppingName}" not found in config`);
          }
        });
      }
      item.price = itemPrice; // Sync verified price
      total += itemPrice;
    } else {
      // Find item in menuItems
      const menuItem = siteData.menuItems.find(mi => mi.id === item.id || mi.name.toLowerCase() === item.name.toLowerCase());
      if (!menuItem) {
        throw new Error(`Invalid item in cart: ${item.name}`);
      }
      item.price = menuItem.price; // Sync verified price
      total += menuItem.price;
    }
  }

  if (orderType === 'delivery') {
    total += 4;
  }
  return Math.round(total * 100) / 100;
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

  // ── API Authentication Route Guards ──
  const protectedApis = ['/api/save', '/api/orders', '/api/orders/update-status'];
  if (protectedApis.includes(pathname)) {
    if (!isAuthenticated(req)) {
      jsonResponse(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }
  }

  // ══════════════════════════════════════
  //  POST /api/login
  // ══════════════════════════════════════
  if (req.method === 'POST' && pathname === '/api/login') {
    try {
      const body = await readBody(req, 1000); // 1KB limit for login
      const { password } = JSON.parse(body);

      if (password === ADMIN_PASSWORD) {
        const token = crypto.randomBytes(32).toString('hex');
        activeSessions.add(token);

        res.writeHead(200, {
          'Set-Cookie': `session_token=${token}; Path=/; HttpOnly; SameSite=Strict`,
          'Content-Type': 'application/json',
          ...CORS
        });
        res.end(JSON.stringify({ ok: true }));
      } else {
        jsonResponse(res, 401, { ok: false, error: 'Incorrect password' });
      }
    } catch (e) {
      jsonResponse(res, 400, { ok: false, error: e.message || 'Invalid request' });
    }
    return;
  }

  // ══════════════════════════════════════
  //  POST /api/logout
  // ══════════════════════════════════════
  if (req.method === 'POST' && pathname === '/api/logout') {
    const cookies = parseCookies(req);
    const token = cookies.session_token;
    if (token) {
      activeSessions.delete(token);
    }
    res.writeHead(200, {
      'Set-Cookie': `session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict`,
      'Content-Type': 'application/json',
      ...CORS
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ══════════════════════════════════════
  //  POST /api/save  →  write site-data.json
  // ══════════════════════════════════════
  if (req.method === 'POST' && pathname === '/api/save') {
    try {
      const body = await readBody(req, 204800); // 200KB limit for site data
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
      const status = e.message === 'Payload too large' ? 413 : 400;
      jsonResponse(res, status, { ok: false, error: e.message || 'Invalid JSON' });
    }
    return;
  }

  // ══════════════════════════════════════
  //  POST /api/create-checkout-session
  // ══════════════════════════════════════
  if (req.method === 'POST' && pathname === '/api/create-checkout-session') {
    if (!stripe) {
      jsonResponse(res, 500, { ok: false, error: 'Stripe not configured. Add keys to .env file.' });
      return;
    }
    try {
      const body = await readBody(req, 50000); // 50KB limit
      const { items, customer, orderType, deliveryAddress } = JSON.parse(body);

      if (!items || !items.length) {
        jsonResponse(res, 400, { ok: false, error: 'Cart is empty' });
        return;
      }

      // Recalculate price on the server to prevent tamper/manipulation
      let validatedTotal;
      try {
        validatedTotal = verifyItemsAndCalculateTotal(items, orderType);
      } catch (err) {
        jsonResponse(res, 400, { ok: false, error: err.message });
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
          unit_amount: Math.round(item.price * 100), // verified cents price
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

      const orderId = 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
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
      const status = e.message === 'Payload too large' ? 413 : 500;
      jsonResponse(res, status, { ok: false, error: e.message });
    }
    return;
  }

  // ══════════════════════════════════════
  //  GET /api/checkout-success
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
        
        let total;
        try {
          total = verifyItemsAndCalculateTotal(items, meta.orderType);
        } catch (e) {
          total = items.reduce((s, i) => s + (parseFloat(i.price) || 0), 0)
                + (meta.orderType === 'delivery' ? 4 : 0);
        }

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
          total: total,
          createdAt: new Date().toISOString(),
          stripeSessionId: sessionId,
          paymentStatus: session.payment_status,
        };

        orders.unshift(order);
        saveOrders(orders);
        console.log(`✓ New order saved: ${order.id} — $${order.total}`);
      }

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
  //  POST /api/orders/place (cash orders)
  // ══════════════════════════════════════
  if (req.method === 'POST' && pathname === '/api/orders/place') {
    try {
      const body = await readBody(req, 50000); // 50KB limit
      const { items, customer, orderType, deliveryAddress, paymentMethod } = JSON.parse(body);

      if (!items || !items.length) {
        jsonResponse(res, 400, { ok: false, error: 'Cart is empty' });
        return;
      }

      // Recalculate and verify prices on the server
      let validatedTotal;
      try {
        validatedTotal = verifyItemsAndCalculateTotal(items, orderType);
      } catch (err) {
        jsonResponse(res, 400, { ok: false, error: err.message });
        return;
      }

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
        total: validatedTotal,
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
      const status = e.message === 'Payload too large' ? 413 : 500;
      jsonResponse(res, status, { ok: false, error: e.message });
    }
    return;
  }

  // ══════════════════════════════════════
  //  GET /api/orders
  // ══════════════════════════════════════
  if (req.method === 'GET' && pathname === '/api/orders') {
    const orders = loadOrders();
    jsonResponse(res, 200, { ok: true, orders });
    return;
  }

  // ══════════════════════════════════════
  //  POST /api/orders/update-status
  // ══════════════════════════════════════
  if (req.method === 'POST' && pathname === '/api/orders/update-status') {
    try {
      const body = await readBody(req, 1000); // 1KB limit
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
      const status = e.message === 'Payload too large' ? 413 : 500;
      jsonResponse(res, status, { ok: false, error: e.message });
    }
    return;
  }

  // ══════════════════════════════════════
  //  GET /api/config
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

    // Authentication Checks for static admin files
    if (urlPath === '/admin.html' || urlPath === '/editor.js') {
      if (!isAuthenticated(req)) {
        res.writeHead(302, { Location: '/login.html' });
        res.end();
        return;
      }
    }

    if (urlPath === '/login.html') {
      if (isAuthenticated(req)) {
        res.writeHead(302, { Location: '/admin.html' });
        res.end();
        return;
      }
    }

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

// Start Server
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