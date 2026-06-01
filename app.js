/* Stachey's Pizza — global interactions, cart, menu filtering, customizer.
   Upgraded: real images on menu cards, color-dot toppings on customizer, full order flow. */

(function () {
  'use strict';

  // Menu data is now loaded dynamically from site-data.json

  // Color map for customizer toppings — CSS colors, universally supported on all devices
  const TOPPING_COLORS = {
    'Tomato':             '#c0392b',
    'White Cream':        '#e8dfc8',
    'Shredded Mozzarella':'#f0e6c8',
    'Fresh Mozzarella':   '#f5f0e0',
    'Pecorino Romano':    '#d4bc7a',
    'Burrata':            '#f2e8d0',
    'Pepperoni':          '#b03020',
    'Italian Sausage':    '#8b6240',
    'Soppressata':        '#943030',
    'Prosciutto':         '#c47060',
    "N'duja":             '#cc4422',
    'Mushrooms':          '#8b7355',
    'Green Peppers':      '#4a7c44',
    'Red Onion':          '#7c3060',
    'Black Olives':       '#3a3a3a',
    'Cherry Tomatoes':    '#d44040',
    'Spinach':            '#3a6640',
    'Roasted Garlic':     '#c8a84b',
    'Calabrian Chili':    '#e04422',
    'Basil':              '#2e7d44',
    'Arugula':            '#5a8a3a',
  };
  const TOPPING_DEFAULT_COLOR = '#7a9a6e';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  // ---------- Cart ----------
  const cart = {
    items: [],
    load() {
      try { this.items = JSON.parse(localStorage.getItem('stacheys.cart') || '[]'); }
      catch { this.items = []; }
    },
    save() { localStorage.setItem('stacheys.cart', JSON.stringify(this.items)); },
    add(item) {
      this.items.push(item);
      this.save();
      this.render();
      openDrawer();
      // Show toast if available
      if (window.showToast) window.showToast(`${item.name} added to your order`);
    },
    remove(idx) {
      this.items.splice(idx, 1);
      this.save();
      this.render();
    },
    total() { return this.items.reduce((s, i) => s + i.price, 0); },
    render() {
      $$('[data-cart-count]').forEach(el => { el.textContent = `(${this.items.length})`; });
      $$('[data-cart-total]').forEach(el => { el.textContent = `$${this.total().toFixed(2)}`; });
      const body = $('[data-cart-body]');
      if (!body) return;
      if (!this.items.length) {
        body.innerHTML = '<div style="color: var(--color-ivory-muted); font-size: 14px; padding: 24px 0;">No items yet. Choose your pies from the menu.</div>';
        return;
      }
      body.innerHTML = this.items.map((it, i) => `
        <div class="drawer__item">
          <div style="flex:1;">
            <div class="drawer__item-name">${escapeHtml(it.name)}</div>
            <div class="drawer__item-meta">${escapeHtml(it.meta || '')}</div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div style="font-family:var(--font-serif); font-size:18px;">$${it.price.toFixed(2)}</div>
            <button class="drawer__close" style="margin-top:6px;" data-cart-remove="${i}">Remove</button>
          </div>
        </div>
      `).join('');
      $$('[data-cart-remove]', body).forEach(btn => {
        btn.addEventListener('click', () => cart.remove(parseInt(btn.dataset.cartRemove, 10)));
      });
    }
  };

  function openDrawer() {
    const d = $('[data-cart-drawer]'); const s = $('[data-cart-scrim]');
    if (d) { d.classList.add('is-open'); d.setAttribute('aria-hidden', 'false'); }
    if (s) s.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    const d = $('[data-cart-drawer]'); const s = $('[data-cart-scrim]');
    if (d) { d.classList.remove('is-open'); d.setAttribute('aria-hidden', 'true'); }
    if (s) s.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  $$('[data-cart-open]').forEach(b => b.addEventListener('click', openDrawer));
  $$('[data-cart-close], [data-cart-scrim]').forEach(b => b.addEventListener('click', closeDrawer));

  // ---------- Magnetic hero tilt (max 5deg) ----------
  $$('[data-magnetic]').forEach(frame => {
    const plate = $('.hero-frame__plate', frame);
    if (!plate) return;
    const MAX_DEG = 5;
    let raf = null;
    frame.addEventListener('mousemove', (e) => {
      const r = frame.getBoundingClientRect();
      const cx = e.clientX - r.left - r.width / 2;
      const cy = e.clientY - r.top - r.height / 2;
      const ry = (cx / (r.width / 2)) * MAX_DEG;
      const rx = -(cy / (r.height / 2)) * MAX_DEG;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        plate.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      });
    });
    frame.addEventListener('mouseleave', () => {
      plate.style.transform = 'rotateX(0deg) rotateY(0deg)';
    });
  });

  // ---------- Counters: roll up on enter ----------
  const counters = $$('[data-counter]');
  if (counters.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          rollCounter(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    counters.forEach(c => io.observe(c));
  }
  function rollCounter(el) {
    const target = parseInt(el.dataset.counter, 10);
    const dur = 1400;
    const start = performance.now();
    (function frame(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(eased * target).toString();
      if (t < 1) requestAnimationFrame(frame);
    })(start);
  }

  // ---------- Parallax (scroll-driven, transform only) ----------
  const parallaxEls = $$('[data-parallax]');
  function tickParallax() {
    parallaxEls.forEach(el => {
      const speed = parseFloat(el.dataset.parallax) || 0;
      const rect = el.getBoundingClientRect();
      const center = rect.top + rect.height / 2 - window.innerHeight / 2;
      const offset = -center * speed;
      el.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
    });
  }
  if (parallaxEls.length) {
    window.addEventListener('scroll', () => requestAnimationFrame(tickParallax), { passive: true });
    tickParallax();
  }

  // Rendering moved to fetch block

  // ---------- Accordion (customizer) ----------
  // This will be called after rendering customizer from data
  function attachAccordionListeners() {
    $$('.accordion__head').forEach(h => {
      h.addEventListener('click', () => h.closest('.accordion__item').classList.toggle('is-open'));
    });
  }

  // ---------- Customizer with CSS color-dot toppings ----------
  function initializeCustomizer(data) {
    const crust = $('[data-crust]');
    if (!crust) return;

    const BASE_PRICE = data.customizerBasePrice || 16;
    const baseToggles = $$('.topping-toggle[data-base="true"]');
    const extraToggles = $$('.topping-toggle:not([data-base="true"])');

    let base = { name: 'Tomato', price: 0, color: '#c0392b' };
    const extras = new Map();

    function paintBase() {
      const inner = $('.crust-canvas__inner', crust);
      if (!inner) return;
      inner.style.background = base.name === 'White Cream'
        ? 'radial-gradient(circle at 40% 35%, #e8e1cf, #c8c0a8 60%, #a89870 100%)'
        : 'radial-gradient(circle at 40% 35%, #c4604a, #8a3220 60%, #5a1e0e 100%)';
    }

    // Stable dot positions using golden angle distribution for natural scatter
    function getDotPositions(slotIndex, count) {
      const positions = [];
      const goldenAngle = 137.508 * (Math.PI / 180);
      const baseRadius = 18;
      const radiusStep = 3;
      for (let k = 0; k < count; k++) {
        const angle = (k + slotIndex * 2.1) * goldenAngle;
        const radius = baseRadius + (k % 4) * radiusStep + slotIndex * 2.5;
        const x = 50 + Math.cos(angle) * Math.min(radius, 36);
        const y = 50 + Math.sin(angle) * Math.min(radius, 36);
        positions.push({ x, y });
      }
      return positions;
    }

    function paintExtras() {
      // Remove old topping dots
      crust.querySelectorAll('.topping-dot-css').forEach(d => d.remove());

      let slotIdx = 0;
      extras.forEach((meta, name) => {
        const color = meta.color;
        const count = 6 + (slotIdx % 3);
        const positions = getDotPositions(slotIdx, count);
        positions.forEach((pos, k) => {
          const el = document.createElement('span');
          el.className = 'topping-dot-css';
          el.style.background = color;
          el.style.left = `${Math.max(10, Math.min(90, pos.x))}%`;
          el.style.top  = `${Math.max(10, Math.min(90, pos.y))}%`;
          el.style.transitionDelay = `${k * 28}ms`;
          crust.appendChild(el);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => el.classList.add('is-active'));
          });
        });
        slotIdx++;
      });
    }

    baseToggles.forEach(btn => {
      btn.addEventListener('click', () => {
        baseToggles.forEach(b => b.classList.remove('is-on'));
        btn.classList.add('is-on');
        base = {
          name: btn.dataset.name,
          price: parseFloat(btn.dataset.price),
          color: btn.dataset.color || TOPPING_COLORS[btn.dataset.name] || TOPPING_DEFAULT_COLOR
        };
        paintBase();
        updateTotal();
      });
    });

    extraToggles.forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        if (extras.has(name)) {
          extras.delete(name);
          btn.classList.remove('is-on');
        } else {
          if (extras.size >= 6) {
            if (window.showToast) window.showToast('Max 6 toppings per pie');
            return;
          }
          extras.set(name, {
            price: parseFloat(btn.dataset.price),
            color: btn.dataset.color || TOPPING_COLORS[name] || TOPPING_DEFAULT_COLOR
          });
          btn.classList.add('is-on');
        }
        paintExtras();
        updateTotal();
      });
    });

    let lastTotal = BASE_PRICE;
    function updateTotal() {
      const total = BASE_PRICE + base.price + Array.from(extras.values()).reduce((s, x) => s + x.price, 0);
      const totalEl = $('[data-custom-total]');
      const summaryEl = $('[data-custom-summary]');
      if (totalEl) {
        animateNumber(totalEl, lastTotal, total, v => `$${v.toFixed(2)}`);
        lastTotal = total;
      }
      if (summaryEl) {
        const names = [base.name, ...extras.keys()];
        summaryEl.textContent = names.join(' · ');
      }
    }

    function animateNumber(el, from, to, fmt) {
      const start = performance.now();
      const dur = 420;
      (function tick(now) {
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = fmt(from + (to - from) * eased);
        if (t < 1) requestAnimationFrame(tick);
      })(start);
    }

    const addBtn = $('[data-custom-add]');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const total = BASE_PRICE + base.price + Array.from(extras.values()).reduce((s, x) => s + x.price, 0);
        const meta = [base.name, ...extras.keys()].join(' · ');
        cart.add({ name: 'Custom 12" Pie', price: total, meta });
      });
    }

    paintBase();
    updateTotal();
  }

  // ---------- Staggered menu card entrance animation ----------
  if ('IntersectionObserver' in window) {
    const cardObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          const card = entry.target;
          const delay = parseInt(card.dataset.animDelay || '0', 10);
          setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
          }, delay);
          cardObserver.unobserve(card);
        }
      });
    }, { threshold: 0.08 });

    // Apply initial state and stagger delays
    $$('.menu-card').forEach((card, i) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(28px)';
      card.style.transition = 'opacity 540ms var(--ease-out), transform 540ms var(--ease-out), box-shadow 360ms var(--ease-out), border-color 320ms var(--ease-out)';
      card.dataset.animDelay = String((i % 3) * 80);
      cardObserver.observe(card);
    });
  }

  // ---------- Smooth scroll for anchor links ----------
  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ---------- Load dynamic site data ----------
  fetch('site-data.json')
    .then(r => r.ok ? r.json() : Promise.reject('Failed to load site-data.json'))
    .then(data => {
      const title = $('[data-edit-target="heroTitle"]');
      if (title && data.heroTitle) title.innerHTML = data.heroTitle; // Allow HTML from editor

      const lead = $('[data-edit-target="heroLead"]');
      if (lead && data.heroLead) lead.textContent = data.heroLead;

      const meta = $('[data-edit-target="heroMeta"]');
      if (meta && data.heroMeta) {
        meta.innerHTML = data.heroMeta.map(m => `<div>${escapeHtml(m)}</div>`).join('');
      }

      const metricsGrid = $('[data-edit-target="metricsGrid"]');
      if (metricsGrid && data.metrics) {
        metricsGrid.innerHTML = data.metrics.map(m => `
          <div>
            <div class="metric__value">
              <span class="counter" data-counter="${m.value}">0</span>${m.suffix ? `<span style="opacity:.5">${escapeHtml(m.suffix)}</span>` : ''}
            </div>
            <div class="metric__label">${escapeHtml(m.label)}</div>
          </div>
        `).join('');
        // Re-observe new counters
        const newCounters = $$('[data-counter]', metricsGrid);
        if ('IntersectionObserver' in window && newCounters.length) {
          const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                rollCounter(entry.target);
                io.unobserve(entry.target);
              }
            });
          }, { threshold: 0.4 });
          newCounters.forEach(c => io.observe(c));
        } else {
          // Fallback if IntersectionObserver is missing or counters aren't found
          newCounters.forEach(c => rollCounter(c));
        }
      }

      const address = $('[data-edit-target="visitAddress"]');
      if (address && data.visitAddress && data.visitCity) {
        address.innerHTML = `${escapeHtml(data.visitAddress)},<br/><em>${escapeHtml(data.visitCity)}</em>`;
      }

      const copy = $('[data-edit-target="visitCopy"]');
      if (copy && data.visitCopy) {
        copy.textContent = data.visitCopy;
      }

      // Render story section
      const storySection = $('[data-edit-target="storySection"]');
      if (storySection && data.storySection) {
        const idx = storySection.querySelector('.story__index');
        const hdg = storySection.querySelector('.story__heading');
        const cpy = storySection.querySelector('.story__copy');
        if (idx && data.storySection.eyebrow) idx.textContent = data.storySection.eyebrow;
        if (hdg && data.storySection.heading) hdg.innerHTML = data.storySection.heading;
        if (cpy && data.storySection.copy) cpy.textContent = data.storySection.copy;
      }

      // Render promise section image
      const promiseImg = $('[data-edit-target="promiseImage"]');
      if (promiseImg && data.promiseSection && data.promiseSection.image) {
        promiseImg.src = data.promiseSection.image;
      }

      const visitImg = $('[data-edit-target="visitImage"]');
      if (visitImg && data.visitSection && data.visitSection.image) {
        visitImg.src = data.visitSection.image;
      }

      // Render Dynamic Menu Filters
      const filtersContainer = $('[data-filters]');
      if (filtersContainer && data.menuTabs) {
        filtersContainer.innerHTML = data.menuTabs.map((t, idx) => `
          <button class="menu-filter ${idx === 0 ? 'is-active' : ''}" data-filter="${escapeHtml(t.id)}">${escapeHtml(t.label)}</button>
        `).join('');
      }

      // Render customizer from dynamic data
      const customizerAccordion = $('[data-customizer-accordion]');
      if (customizerAccordion && data.customizerCategories) {
        customizerAccordion.innerHTML = data.customizerCategories.map((cat, catIdx) => `
          <div class="accordion__item">
            <button class="accordion__head">${escapeHtml(cat.name)}</button>
            <div class="accordion__body" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 12px; padding: 16px;">
              ${cat.toppings.map(topping => {
                const dotColor = TOPPING_COLORS[topping.name] || TOPPING_DEFAULT_COLOR;
                return `
                <button class="topping-toggle ${topping.isBase ? 'is-on' : ''}" data-base="${topping.isBase ? 'true' : 'false'}" data-name="${escapeHtml(topping.name)}" data-price="${topping.price}" data-color="${escapeHtml(dotColor)}" style="padding: 12px; border: 1px solid var(--color-line); background: transparent; color: var(--color-ivory); cursor: pointer; font-size: 14px; transition: all 0.2s;">
                  <div style="width: 22px; height: 22px; border-radius: 50%; background: ${escapeHtml(dotColor)}; margin: 0 auto 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>
                  <div style="font-size: 11px;">${escapeHtml(topping.name)}</div>
                  ${topping.price > 0 ? `<div style="font-size: 10px; color: var(--color-accent);">+$${topping.price}</div>` : ''}
                </button>
                `;
              }).join('')}
            </div>
          </div>
        `).join('');

        // Attach accordion listeners AFTER rendering
        attachAccordionListeners();
        
        // Initialize customizer with the data
        initializeCustomizer(data);
      }

      // Render Dynamic Menu Grid
      const grid = $('[data-menu-grid]');
      if (grid && data.menuItems) {
        // Expose MENU globally for cart add logic
        window.MENU = data.menuItems;

        grid.innerHTML = data.menuItems.map(item => `
          <article class="menu-card" data-category="${escapeHtml(item.category)}" data-id="${escapeHtml(item.id)}">
            <div class="menu-card__media" role="img" aria-label="${escapeHtml(item.name)}">
              ${item.tag ? `<span class="menu-card__media-tag">${escapeHtml(item.tag)}</span>` : ''}
              <img
                src="${escapeHtml(item.image || '')}"
                alt="${escapeHtml(item.name)}"
                loading="lazy"
                onerror="this.style.display='none'"
              />
            </div>
            <div class="menu-card__row">
              <h3 class="menu-card__name">${escapeHtml(item.name)}</h3>
              <span class="menu-card__price">$${item.price}</span>
            </div>
            <p class="menu-card__ingredients">${escapeHtml(item.ingredients)}</p>
            <button class="menu-card__add" data-add="${escapeHtml(item.id)}">Add to Order</button>
          </article>
        `).join('');

        // Re-attach Add to Order events
        $$('[data-add]', grid).forEach(btn => {
          btn.addEventListener('click', () => {
            const item = data.menuItems.find(m => m.id === btn.dataset.add);
            if (item) cart.add({ name: item.name, price: item.price, meta: item.ingredients });
          });
        });
        
        // Re-attach Filter events
        $$('[data-filters] [data-filter]').forEach(btn => {
          btn.addEventListener('click', () => {
            $$('[data-filters] [data-filter]').forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            const f = btn.dataset.filter;
            $$('.menu-card').forEach(card => {
              const match = f === 'all' || card.dataset.category === f;
              card.classList.toggle('is-hidden', !match);
            });
          });
        });
        
        // Trigger staggered card animation if observer exists
        if ('IntersectionObserver' in window) {
          const cardObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry, i) => {
              if (entry.isIntersecting) {
                const card = entry.target;
                const delay = parseInt(card.dataset.animDelay || '0', 10);
                setTimeout(() => {
                  card.style.opacity = '1';
                  card.style.transform = 'translateY(0)';
                }, delay);
                cardObserver.unobserve(card);
              }
            });
          }, { threshold: 0.08 });

          $$('.menu-card').forEach((card, i) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(28px)';
            card.style.transition = 'opacity 540ms var(--ease-out), transform 540ms var(--ease-out), box-shadow 360ms var(--ease-out), border-color 320ms var(--ease-out)';
            card.dataset.animDelay = String((i % 3) * 80);
            cardObserver.observe(card);
          });
        }
      }

      // Render dynamic navigation links
      const navLinks = $('.nav__links');
      const mobileMenu = $('#mobileMenu');
      if (data.customPages) {
        const params = new URLSearchParams(window.location.search);
        const currentPageSlug = params.get('page');
        const isCustomPage = window.location.pathname.endsWith('page.html');
        
        // Clear active class from existing static links if on a custom page
        if (isCustomPage) {
          $$('.nav__link', navLinks).forEach(a => a.classList.remove('active'));
        }

        data.customPages.forEach(p => {
          const isActive = isCustomPage && currentPageSlug === p.slug;
          
          if (navLinks) {
            const a = document.createElement('a');
            a.className = `nav__link ${isActive ? 'active' : ''}`;
            a.href = `page.html?page=${p.slug}`;
            a.textContent = p.title;
            navLinks.appendChild(a);
          }
          
          if (mobileMenu) {
            const a = document.createElement('a');
            a.href = `page.html?page=${p.slug}`;
            a.textContent = p.title;
            mobileMenu.appendChild(a);
          }
        });

        // Re-attach mobile hamburger links click handler if we added links
        if (mobileMenu) {
          mobileMenu.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', () => {
              mobileMenu.classList.remove('is-open');
              const hamburger = document.getElementById('hamburgerBtn');
              if (hamburger) hamburger.textContent = 'Menu';
            });
          });
        }
      }

      // Render custom page content (if on page.html)
      const customPageMain = $('[data-custom-page-main]');
      if (customPageMain && data.customPages) {
        const params = new URLSearchParams(window.location.search);
        const pageSlug = params.get('page');
        const page = data.customPages.find(p => p.slug === pageSlug);
        
        if (page) {
          document.title = `${page.title} — Stachey's Pizza`;
          
          let sectionsHtml = `
            <section class="menu-header container" style="padding-bottom: 20px;">
              <div>
                <div class="hero__eyebrow">— Stachey's Pizza</div>
                <h1 class="menu-title">${escapeHtml(page.title)}</h1>
              </div>
            </section>
          `;
          
          if (!page.sections || page.sections.length === 0) {
            sectionsHtml += `
              <section class="container" style="padding: 80px 0 120px; text-align: center;">
                <p style="color: var(--color-ivory-dim);">This page has no content yet.</p>
              </section>
            `;
          } else {
            page.sections.forEach((sec, idx) => {
              const isEven = idx % 2 === 0;
              const hasImage = sec.image && sec.image.trim() !== '';
              
              if (hasImage) {
                const imgCol = `<div><img class="story__image" src="${escapeHtml(sec.image)}" alt="${escapeHtml(sec.heading)}" loading="lazy" /></div>`;
                const textCol = `
                  <div>
                    <div class="story__index" style="margin-bottom: 28px;">— Section No. ${String(idx + 1).padStart(2, '0')}</div>
                    <h2 class="story__heading" style="font-size: clamp(36px, 4vw, 60px); margin-bottom: 28px;">${escapeHtml(sec.heading)}</h2>
                    <p class="story__copy" style="max-width: none;">${escapeHtml(sec.text)}</p>
                  </div>
                `;
                
                sectionsHtml += `
                  <section class="container" style="padding: 60px 0 80px; display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center;">
                    ${isEven ? imgCol + textCol : textCol + imgCol}
                  </section>
                `;
              } else {
                sectionsHtml += `
                  <section class="container" style="padding: 60px 0 80px; max-width: 800px; margin: 0 auto;">
                    <div class="story__index" style="margin-bottom: 28px;">— Section No. ${String(idx + 1).padStart(2, '0')}</div>
                    <h2 class="story__heading" style="font-size: clamp(32px, 3.5vw, 50px); margin-bottom: 24px;">${escapeHtml(sec.heading)}</h2>
                    <p class="story__copy" style="max-width: none; font-size: 17px; line-height: 1.8;">${escapeHtml(sec.text)}</p>
                  </section>
                `;
              }
            });
          }
          customPageMain.innerHTML = sectionsHtml;
        } else {
          customPageMain.innerHTML = `
            <section class="menu-header container" style="text-align: center; padding: 180px 0 120px;">
              <h1 class="menu-title" style="font-size: 60px; margin-bottom: 24px;">Page Not Found</h1>
              <p style="color: var(--color-ivory-dim); margin-bottom: 48px;">The page you are looking for does not exist or has been deleted.</p>
              <a class="btn btn--accent" href="index.html">Back to Home</a>
            </section>
          `;
        }
      }

      // Render dynamic footer
      const footerGrid = $('[data-edit-target="footerGrid"]');
      if (footerGrid && data.footer) {
        let colsHtml = '';
        
        // Column 1: Brand / Tagline / Legal
        colsHtml += `
          <div class="footer__group">
            <div style="font-family: var(--font-serif); font-size: 20px; color: var(--color-ivory); margin-bottom: 12px; text-transform: none;">${escapeHtml(data.footer.brand || '')}</div>
            <p style="text-transform: none;">${escapeHtml(data.footer.tagline || '')}</p>
            <p style="margin-top: 24px; font-size: 10px; color: var(--color-ivory-muted); text-transform: none;">${escapeHtml(data.footer.legal || '')}</p>
          </div>
        `;

        // Columns 2 & 3: Locations
        const locs = data.footer.locations || [];
        locs.forEach(loc => {
          colsHtml += `
            <div class="footer__group">
              <div style="font-size: 11px; letter-spacing: 0.18em; color: var(--color-ivory); margin-bottom: 12px;">${escapeHtml(loc.label || '')}</div>
              <p style="text-transform: none; margin: 0 0 4px;">${escapeHtml(loc.address || '')}</p>
              <p style="text-transform: none; margin: 0 0 12px;">${escapeHtml(loc.city || '')}</p>
              <p style="font-size: 11px; margin: 0 0 2px; color: var(--color-ivory-muted);">${escapeHtml(loc.hours || '')}</p>
              <p style="font-size: 11px; margin: 0 0 12px; color: var(--color-ivory-muted);">${escapeHtml(loc.hours2 || '')}</p>
              <p style="text-transform: none; font-family: var(--font-serif); font-size: 15px; color: var(--color-accent-bright);"><a href="tel:${escapeHtml(loc.phone || '')}">${escapeHtml(loc.phone || '')}</a></p>
            </div>
          `;
        });

        // Column 4: Contact & Social
        colsHtml += `
          <div class="footer__group">
            <div style="font-size: 11px; letter-spacing: 0.18em; color: var(--color-ivory); margin-bottom: 12px;">Contact</div>
            <p style="text-transform: none; margin: 0 0 16px;"><a href="mailto:${escapeHtml(data.footer.email || '')}" style="color: var(--color-accent-bright);">${escapeHtml(data.footer.email || '')}</a></p>
            <div style="display: flex; gap: 16px; margin-top: 12px;">
        `;
        if (data.footer.social) {
          if (data.footer.social.instagram) {
            colsHtml += `<a href="${escapeHtml(data.footer.social.instagram)}" target="_blank" rel="noopener" style="font-size: 11px; color: var(--color-ivory-dim); hover: color: var(--color-ivory);">Instagram</a>`;
          }
          if (data.footer.social.facebook) {
            colsHtml += `<a href="${escapeHtml(data.footer.social.facebook)}" target="_blank" rel="noopener" style="font-size: 11px; color: var(--color-ivory-dim); hover: color: var(--color-ivory);">Facebook</a>`;
          }
          if (data.footer.social.yelp) {
            colsHtml += `<a href="${escapeHtml(data.footer.social.yelp)}" target="_blank" rel="noopener" style="font-size: 11px; color: var(--color-ivory-dim); hover: color: var(--color-ivory);">Yelp</a>`;
          }
        }
        colsHtml += `
            </div>
          </div>
        `;

        footerGrid.innerHTML = colsHtml;
      }
    })
    .catch(() => { /* Silent fallback to static HTML */ });

  // Initial cart render on every page
  cart.load();
  cart.render();
})();
