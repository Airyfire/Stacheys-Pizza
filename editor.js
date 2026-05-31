/*  Stachey's Pizza — Admin Editor  v3
    ─────────────────────────────────
    • Full menu editor: edit name, price, ingredients, tag, image, category
      + delete items + add new items
    • Footer editor: two locations, social links, email, legal — all editable
    • Publish scrapes the structured editor state (not the customer-facing DOM)
    • Requires node server.js → http://localhost:3001/admin.html
*/
(function () {
  'use strict';
 
  let siteData = null;
  let dirty    = false;
 
  // ── Bootstrap ──────────────────────────────────────────────
  function waitForData(tries) {
    tries = tries || 0;
    fetch('site-data.json?' + Date.now())
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(data => { siteData = data; init(); })
      .catch(() => {
        if (tries < 12) setTimeout(() => waitForData(tries + 1), 350);
        else alert('Cannot load site-data.json.\nRun: node server.js\nThen open: http://localhost:3001/admin.html');
      });
  }
  waitForData();
 
  // ── Init ───────────────────────────────────────────────────
  function init() {
    injectStyles();
    buildTabs();
    buildPublishBar();
    populateHome();
    populateStory();
    renderMenuEditor();
    renderCustomizerEditor();
    renderFooterEditor();
    renderCustomPageViews();
    
    // Live orders polling
    setInterval(refreshOrdersBoard, 10000);
    refreshOrdersBoard();

    document.addEventListener('input', () => { dirty = true; markDirty(); });
    window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  }
 
  // ── Styles ─────────────────────────────────────────────────
  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
      /* ── editable fields ── */
      [contenteditable="true"] {
        outline: 1px dashed rgba(90,122,82,0.45);
        outline-offset: 3px; cursor: text; min-height: 1em;
        border-radius: 2px; transition: outline .15s, background .15s;
      }
      [contenteditable="true"]:hover { outline-color: var(--color-accent); }
      [contenteditable="true"]:focus { outline: 2px solid var(--color-accent); background: rgba(90,122,82,0.08); }
 
      /* ── image hover overlay ── */
      .img-edit-wrap { position: relative; display: block; cursor: pointer; }
      .img-edit-wrap::after {
        content: '✎ Change image'; position: absolute; inset: 0;
        background: rgba(0,0,0,0); color: transparent;
        display: flex; align-items: center; justify-content: center;
        font-size: 12px; letter-spacing: .1em; text-transform: uppercase;
        transition: background .2s, color .2s; pointer-events: none;
      }
      .img-edit-wrap:hover::after { background: rgba(0,0,0,.55); color: var(--color-ivory); }
 
      /* ── publish bar ── */
      .publish-bar {
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 10000;
        background: rgba(20,17,15,.97); border-top: 1px solid var(--color-accent);
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 32px; backdrop-filter: blur(10px);
      }
      .publish-bar__left  { display: flex; align-items: center; gap: 20px; }
      .publish-bar__status { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--color-ivory-muted); }
      .publish-bar__status.is-dirty { color: #e8a45a; }
      .publish-bar__btn {
        background: var(--color-accent); border: none; color: var(--color-ivory);
        padding: 14px 36px; font-family: var(--font-sans); font-size: 12px;
        font-weight: 600; letter-spacing: .18em; text-transform: uppercase;
        cursor: pointer; transition: background .2s, transform .15s;
      }
      .publish-bar__btn:hover:not(:disabled) { background: var(--color-accent-bright); transform: translateY(-1px); }
      .publish-bar__btn:disabled { opacity: .45; cursor: not-allowed; }
 
      .admin-view { padding-bottom: 120px !important; }
 
      /* ── menu editor ── */
      .med-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 24px; margin-top: 32px;
      }
      .med-card {
        border: 1px solid var(--color-line); padding: 0;
        position: relative; background: var(--color-bg-alt);
        display: flex; flex-direction: column;
      }
      .med-card__img-wrap { position: relative; aspect-ratio: 5/4; overflow: hidden; cursor: pointer; }
      .med-card__img-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; filter: brightness(.88); transition: filter .3s; }
      .med-card__img-wrap:hover img { filter: brightness(1); }
      .med-card__img-wrap::after {
        content: '✎ Change image'; position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0); color: transparent;
        font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
        transition: all .2s; pointer-events: none;
      }
      .med-card__img-wrap:hover::after { background: rgba(0,0,0,.5); color: var(--color-ivory); }
      .med-card__body { padding: 20px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
      .med-field-row { display: flex; gap: 10px; align-items: center; }
      .med-label {
        font-size: 9px; letter-spacing: .22em; text-transform: uppercase;
        color: var(--color-accent-bright); margin-bottom: 4px; display: block;
      }
      .med-input {
        width: 100%; background: transparent;
        border: none; border-bottom: 1px solid var(--color-line);
        color: var(--color-ivory); font-family: var(--font-sans); font-size: 14px;
        padding: 6px 0; outline: none; transition: border-color .2s;
      }
      .med-input:focus { border-color: var(--color-accent); }
      .med-input--price { width: 80px; flex-shrink: 0; font-family: var(--font-serif); font-size: 18px; }
      .med-select {
        background: var(--color-bg); border: 1px solid var(--color-line);
        color: var(--color-ivory); font-family: var(--font-sans); font-size: 12px;
        padding: 6px 10px; outline: none; cursor: pointer; flex: 1;
      }
      .med-select:focus { border-color: var(--color-accent); }
      .med-card__delete {
        position: absolute; top: 10px; right: 10px; z-index: 10;
        background: rgba(20,17,15,.85); border: 1px solid #c44; color: #c44;
        padding: 4px 10px; font-size: 10px; letter-spacing: .12em; text-transform: uppercase;
        cursor: pointer; transition: all .2s;
      }
      .med-card__delete:hover { background: rgba(204,68,68,.25); }
      .med-tag-input {
        font-size: 9px; letter-spacing: .2em; text-transform: uppercase;
        background: transparent; border: 1px dashed var(--color-line);
        color: var(--color-ivory-dim); padding: 4px 10px; outline: none;
        transition: border-color .2s; width: 100%;
      }
      .med-tag-input:focus { border-color: var(--color-accent); }
      .med-add-btn {
        border: 1px dashed var(--color-line); background: transparent;
        color: var(--color-ivory-dim); padding: 32px; text-align: center;
        font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
        cursor: pointer; transition: all .2s; display: flex;
        align-items: center; justify-content: center; gap: 8px;
        min-height: 200px;
      }
      .med-add-btn:hover { border-color: var(--color-accent); color: var(--color-ivory); }
      .med-filter-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
      .med-filter-btn {
        background: transparent; border: 1px solid var(--color-line);
        color: var(--color-ivory-dim); padding: 6px 14px; font-size: 10px;
        letter-spacing: .14em; text-transform: uppercase; cursor: pointer;
        transition: all .2s;
      }
      .med-filter-btn.active, .med-filter-btn:hover {
        border-color: var(--color-accent); color: var(--color-ivory);
        background: rgba(90,122,82,.1);
      }
 
      /* ── footer editor ── */
      .fed-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 32px;
      }
      .fed-card {
        border: 1px solid var(--color-line); padding: 28px;
        background: var(--color-bg-alt); position: relative;
      }
      .fed-card__title {
        font-family: var(--font-serif); font-size: 20px; color: var(--color-ivory);
        margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--color-line);
      }
      .fed-field { margin-bottom: 18px; }
      .fed-label {
        font-size: 9px; letter-spacing: .22em; text-transform: uppercase;
        color: var(--color-accent-bright); display: block; margin-bottom: 6px;
      }
      .fed-input {
        width: 100%; background: transparent;
        border: none; border-bottom: 1px solid var(--color-line);
        color: var(--color-ivory); font-family: var(--font-sans); font-size: 14px;
        padding: 8px 0; outline: none; transition: border-color .2s;
      }
      .fed-input:focus { border-color: var(--color-accent); }
      .fed-loc-card {
        border: 1px solid var(--color-line); padding: 20px; margin-bottom: 16px;
        position: relative;
      }
      .fed-loc-title {
        font-size: 11px; letter-spacing: .18em; text-transform: uppercase;
        color: var(--color-ivory-muted); margin-bottom: 16px;
      }
      .fed-del-loc {
        position: absolute; top: 12px; right: 12px;
        background: transparent; border: 1px solid #c44; color: #c44;
        padding: 3px 10px; font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
        cursor: pointer; transition: all .2s;
      }
      .fed-del-loc:hover { background: rgba(204,68,68,.15); }
      .fed-add-loc {
        background: transparent; border: 1px dashed var(--color-line);
        color: var(--color-ivory-dim); padding: 12px 24px; width: 100%;
        font-family: var(--font-sans); font-size: 11px; letter-spacing: .12em;
        text-transform: uppercase; cursor: pointer; transition: all .2s; margin-top: 8px;
      }
      .fed-add-loc:hover { border-color: var(--color-accent); color: var(--color-ivory); }
 
      /* ── section label ── */
      .admin-section-label {
        font-size: 10px; letter-spacing: .28em; text-transform: uppercase;
        color: var(--color-accent-bright); margin-bottom: 24px; padding-bottom: 12px;
        border-bottom: 1px solid var(--color-line);
      }
    `;
    document.head.appendChild(s);
  }
 
  // ── Publish Bar ────────────────────────────────────────────
  function buildPublishBar() {
    const bar = document.createElement('div');
    bar.className = 'publish-bar';
    bar.innerHTML = `
      <div class="publish-bar__left">
        <span class="publish-bar__status" id="publishStatus">No unsaved changes</span>
      </div>
      <button class="publish-bar__btn" id="publishBtn">Publish Changes</button>
    `;
    document.body.appendChild(bar);
    document.getElementById('publishBtn').addEventListener('click', handlePublish);
  }
  function markDirty() {
    const s = document.getElementById('publishStatus');
    if (s) { s.textContent = 'Unsaved changes'; s.classList.add('is-dirty'); }
  }
  function markClean() {
    dirty = false;
    const s = document.getElementById('publishStatus');
    if (s) { s.textContent = 'All changes saved'; s.classList.remove('is-dirty'); }
  }
 
  // ── Tab Bar ────────────────────────────────────────────
  let _tabsDelegated = false;
  function buildTabs() {
    const c = document.getElementById('adminTabs');
    if (!c) return;
 
    // Preserve the currently active view across rebuilds
    const curActive = c.querySelector('.admin-tab.active');
    const activeView = curActive ? curActive.dataset.view : 'orders';
 
    const builtins = [
      { id:'orders', label:'Orders 📋' },
      { id:'home', label:'Home' }, { id:'story', label:'Story' },
      { id:'menu', label:'Menu' }, { id:'customize', label:'Customizer' },
      { id:'footer', label:'Footer' }
    ];
    let html = builtins.map(t => {
      const active = t.id === activeView ? ' active' : '';
      return '<button class="admin-tab' + active + '" data-view="' + t.id + '">' + t.label + '</button>';
    }).join('');
    (siteData.customPages||[]).forEach(p => {
      const active = ('custom-' + p.id) === activeView ? ' active' : '';
      html += '<button class="admin-tab' + active + '" data-view="custom-' + p.id + '">' + esc(p.title) + '</button>';
    });
    html += '<button class="admin-tab admin-tab--add" data-add-page="1">＋ Add Page</button>';
    c.innerHTML = html;
 
    // Re-attach view-switch clicks on freshly created buttons
    c.querySelectorAll('.admin-tab[data-view]').forEach(b =>
      b.addEventListener('click', () => switchView(b.dataset.view, b))
    );
 
    // Delegate the add-page click on the stable container — only wire once ever
    if (!_tabsDelegated) {
      _tabsDelegated = true;
      c.addEventListener('click', e => {
        if (e.target.closest('[data-add-page]')) addNewPage();
      });
    }
  }
  function switchView(id, btn) {
    document.querySelectorAll('.admin-view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.admin-tab').forEach(el => el.classList.remove('active'));
    const v = document.getElementById('view-' + id);
    if (v) v.classList.add('active');
    if (btn) btn.classList.add('active');
    if (id === 'orders') {
      refreshOrdersBoard();
    }
  }
 
  // ── Home ───────────────────────────────────────────────────
  function populateHome() {
    const titleEl = document.querySelector('[data-edit-target="heroTitle"]');
    if (titleEl) { titleEl.innerHTML = siteData.heroTitle||''; makeEditable(titleEl); }
    const leadEl = document.querySelector('[data-edit-target="heroLead"]');
    if (leadEl)  { leadEl.textContent = siteData.heroLead||''; makeEditable(leadEl); }
    const metaEl = document.querySelector('[data-edit-target="heroMeta"]');
    if (metaEl && siteData.heroMeta) {
      metaEl.innerHTML = siteData.heroMeta.map(m=>`<div>${esc(m)}</div>`).join('');
      Array.from(metaEl.children).forEach(c => makeEditable(c));
    }
    const metricsEl = document.querySelector('[data-edit-target="metricsGrid"]');
    if (metricsEl && siteData.metrics) {
      metricsEl.innerHTML = siteData.metrics.map(m=>`
        <div>
          <div class="metric__value">
            <span contenteditable="true">${m.value}</span>${m.suffix?`<span style="opacity:.5">${esc(m.suffix)}</span>`:''}
          </div>
          <div class="metric__label" contenteditable="true">${esc(m.label)}</div>
        </div>`).join('');
    }
  }
 
  // ── Story ──────────────────────────────────────────────────
  function populateStory() {
    const ss = document.querySelector('[data-edit-target="storySection"]');
    if (ss && siteData.storySection) {
      const d = siteData.storySection;
      const idx=ss.querySelector('.story__index'), hdg=ss.querySelector('.story__heading'), cpy=ss.querySelector('.story__copy');
      if (idx){idx.textContent=d.eyebrow||''; makeEditable(idx);}
      if (hdg){hdg.innerHTML=d.heading||'';    makeEditable(hdg);}
      if (cpy){cpy.textContent=d.copy||'';     makeEditable(cpy);}
    }
    const ps = document.querySelector('[data-edit-target="promiseSection"]');
    if (ps && siteData.promiseSection) {
      const d = siteData.promiseSection;
      const idx=ps.querySelector('.story__index'), hdg=ps.querySelector('.story__heading'), cpy=ps.querySelector('.story__copy');
      if (idx){idx.textContent=d.eyebrow||''; makeEditable(idx);}
      if (hdg){hdg.innerHTML=d.heading||'';    makeEditable(hdg);}
      if (cpy){cpy.textContent=d.copy||'';     makeEditable(cpy);}
      const img=ps.querySelector('img[data-edit-target="promiseImage"]');
      if (img){img.src=d.image||''; makeImageEditable(img, v=>{siteData.promiseSection.image=v;});}
    }
    const addrEl=document.querySelector('[data-edit-target="visitAddress"]');
    if (addrEl) {
      addrEl.innerHTML=`${esc(siteData.visitAddress||'')},<br/><em>${esc(siteData.visitCity||'')}</em>`;
      makeEditable(addrEl);
    }
    const copyEl=document.querySelector('[data-edit-target="visitCopy"]');
    if (copyEl){copyEl.textContent=siteData.visitCopy||''; makeEditable(copyEl);}
    const vi=document.querySelector('[data-edit-target="visitImage"]');
    if (vi && siteData.visitSection){vi.src=siteData.visitSection.image||''; makeImageEditable(vi, v=>{siteData.visitSection.image=v;});}
  }
 
  // ════════════════════════════════════════════════════════════
  //  MENU EDITOR  — full CRUD, not the customer-facing grid
  // ════════════════════════════════════════════════════════════
  function renderMenuEditor() {
    const view = document.getElementById('view-menu');
    if (!view) return;
 
    // Replace the customer-facing shell entirely
    view.innerHTML = `
      <div class="container" style="padding:80px 0;">
        <div class="admin-section-label">Menu Editor</div>
        <p style="color:var(--color-ivory-dim);margin-bottom:24px;font-size:14px;">
          Click any field to edit. Click the image to replace it. Use the category dropdown to move items between sections.
        </p>
 
        <!-- Filter bar -->
        <div class="med-filter-bar" id="medFilterBar">
          <button class="med-filter-btn active" data-mf="all">All</button>
          <button class="med-filter-btn" data-mf="red">Red Pies</button>
          <button class="med-filter-btn" data-mf="white">White Pies</button>
          <button class="med-filter-btn" data-mf="sides">Sides</button>
          <button class="med-filter-btn" data-mf="greens">Greens</button>
        </div>
 
        <!-- Cards grid -->
        <div class="med-grid" id="medGrid"></div>
      </div>
    `;
 
    // Filter buttons
    let activeFilter = 'all';
    view.querySelectorAll('.med-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        view.querySelectorAll('.med-filter-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.mf;
        renderCards();
      });
    });
 
    function renderCards() {
      const grid = document.getElementById('medGrid');
      if (!grid) return;
      const items = (siteData.menuItems||[]).filter(it => activeFilter==='all' || it.category===activeFilter);
 
      grid.innerHTML = '';
 
      items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'med-card';
        card.dataset.itemId = item.id;
        card.innerHTML = `
          <button class="med-card__delete" data-del="${item.id}">✕ Remove</button>
          <div class="med-card__img-wrap" data-img="${item.id}">
            <img src="${esc(item.image||'')}" alt="${esc(item.name)}" loading="lazy"
                 onerror="this.style.opacity='.3'" />
          </div>
          <div class="med-card__body">
            <div>
              <span class="med-label">Name</span>
              <input class="med-input" type="text" value="${esc(item.name)}" data-field="name" data-id="${item.id}" />
            </div>
            <div class="med-field-row">
              <div style="flex:1;">
                <span class="med-label">Price</span>
                <input class="med-input med-input--price" type="number" value="${item.price}" min="0" step="0.5" data-field="price" data-id="${item.id}" />
              </div>
              <div style="flex:2;">
                <span class="med-label">Category</span>
                <select class="med-select" data-field="category" data-id="${item.id}">
                  <option value="red"    ${item.category==='red'   ?'selected':''}>Red Pies</option>
                  <option value="white"  ${item.category==='white' ?'selected':''}>White Pies</option>
                  <option value="sides"  ${item.category==='sides' ?'selected':''}>Sides</option>
                  <option value="greens" ${item.category==='greens'?'selected':''}>Greens</option>
                </select>
              </div>
            </div>
            <div>
              <span class="med-label">Ingredients</span>
              <input class="med-input" type="text" value="${esc(item.ingredients||'')}" data-field="ingredients" data-id="${item.id}" />
            </div>
            <div>
              <span class="med-label">Badge / Tag (optional)</span>
              <input class="med-tag-input" type="text" value="${esc(item.tag||'')}" placeholder="e.g. Best Seller, Seasonal…" data-field="tag" data-id="${item.id}" />
            </div>
          </div>
        `;
        grid.appendChild(card);
      });
 
      // Add-new card
      const addCard = document.createElement('div');
      addCard.className = 'med-card';
      addCard.innerHTML = `<button class="med-add-btn" id="medAddBtn">＋ Add Menu Item</button>`;
      grid.appendChild(addCard);
 
      // ── events ──
      // Image click
      grid.querySelectorAll('[data-img]').forEach(wrap => {
        wrap.addEventListener('click', () => {
          const id  = wrap.dataset.img;
          const it  = siteData.menuItems.find(i=>i.id===id);
          if (!it) return;
          const url = prompt('Image URL:', it.image||'');
          if (url !== null && url.trim()) {
            it.image = url.trim();
            wrap.querySelector('img').src = url.trim();
            dirty=true; markDirty();
          }
        });
      });
 
      // Input / select changes → update siteData live
      grid.querySelectorAll('[data-field][data-id]').forEach(inp => {
        inp.addEventListener('input', () => {
          const it = siteData.menuItems.find(i=>i.id===inp.dataset.id);
          if (!it) return;
          const val = inp.dataset.field==='price' ? (parseFloat(inp.value)||0) : inp.value;
          it[inp.dataset.field] = val;
          dirty=true; markDirty();
        });
        // select fires change not input
        inp.addEventListener('change', () => {
          const it = siteData.menuItems.find(i=>i.id===inp.dataset.id);
          if (!it) return;
          it[inp.dataset.field] = inp.value;
          dirty=true; markDirty();
          // Re-render if filter is active and category changed
          if (activeFilter!=='all' && inp.dataset.field==='category') renderCards();
        });
      });
 
      // Delete item
      grid.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.del;
          const it = siteData.menuItems.find(i=>i.id===id);
          if (!it) return;
          if (!confirm(`Remove "${it.name}" from the menu?`)) return;
          siteData.menuItems = siteData.menuItems.filter(i=>i.id!==id);
          dirty=true; markDirty();
          renderCards();
          if (window.showToast) window.showToast(`"${it.name}" removed — Publish to save.`);
        });
      });
 
      // Add new item
      const addBtn = document.getElementById('medAddBtn');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          const name = prompt('New item name:');
          if (!name||!name.trim()) return;
          const newItem = {
            id:          'item_' + Date.now(),
            name:        name.trim(),
            category:    activeFilter==='all' ? 'red' : activeFilter,
            price:       14,
            ingredients: '',
            tag:         '',
            image:       'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&q=80&auto=format&fit=crop'
          };
          siteData.menuItems = siteData.menuItems||[];
          siteData.menuItems.push(newItem);
          dirty=true; markDirty();
          renderCards();
          if (window.showToast) window.showToast(`"${newItem.name}" added — fill in the details then Publish.`);
        });
      }
    }
 
    renderCards();
  }
 
  // ════════════════════════════════════════════════════════════
  //  CUSTOMIZER EDITOR
  // ════════════════════════════════════════════════════════════
  function renderCustomizerEditor() {
    const container   = document.getElementById('customizerEditor');
    const basePriceEl = document.getElementById('customizerBasePrice');
    if (!container) return;
    if (basePriceEl) {
      basePriceEl.value = siteData.customizerBasePrice||16;
      basePriceEl.addEventListener('input', ()=>{
        siteData.customizerBasePrice=parseFloat(basePriceEl.value)||16;
        dirty=true; markDirty();
      });
    }
    function render() {
      let html='';
      (siteData.customizerCategories||[]).forEach((cat,ci)=>{
        html+=`
          <div class="category-header">
            <h3 contenteditable="true" data-cat-idx="${ci}"
                style="font-family:var(--font-serif);font-size:22px;outline:1px dashed rgba(90,122,82,.4);outline-offset:4px;padding:2px 6px;cursor:text;">${esc(cat.name)}</h3>
            <div style="display:flex;gap:8px;">
              <button class="add-topping-btn" data-add-top="${ci}">➕ Add Topping</button>
              <button class="add-topping-btn" data-del-cat="${ci}" style="border-color:#c44;color:#c44;">✕ Remove</button>
            </div>
          </div>
          <div style="margin-bottom:8px;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--color-ivory-muted);">Name · Price</div>
        `;
        cat.toppings.forEach((top,ti)=>{
          html+=`
            <div class="topping-editor-row" data-ci="${ci}" data-ti="${ti}">
              <input type="text"   value="${esc(top.name)}"  data-field="name"  placeholder="Topping name" />
              <input type="number" value="${top.price}"       data-field="price" step="0.5" min="0" style="text-align:right;" />
              <input type="text"   value=""                  data-field="emoji" style="text-align:center;font-size:18px;width:48px;" placeholder="—" disabled title="Emoji unused — toppings use canvas art" />
              <button class="topping-delete-btn" data-del-top="${ci}-${ti}">✕</button>
            </div>`;
        });
      });
      container.innerHTML=html;
      attachCustEvents();
    }
    function attachCustEvents() {
      container.querySelectorAll('[data-cat-idx]').forEach(el=>{
        el.addEventListener('blur',()=>{
          const ci=parseInt(el.dataset.catIdx);
          if(siteData.customizerCategories[ci]) siteData.customizerCategories[ci].name=el.textContent.trim();
          dirty=true; markDirty();
        });
      });
      container.querySelectorAll('.topping-editor-row').forEach(row=>{
        const ci=parseInt(row.dataset.ci), ti=parseInt(row.dataset.ti);
        row.querySelectorAll('input:not([disabled])').forEach(inp=>{
          inp.addEventListener('input',()=>{
            const val=inp.dataset.field==='price'?(parseFloat(inp.value)||0):inp.value;
            siteData.customizerCategories[ci].toppings[ti][inp.dataset.field]=val;
            dirty=true; markDirty();
          });
        });
      });
      container.querySelectorAll('[data-del-top]').forEach(btn=>{
        btn.addEventListener('click',()=>{
          const [ci,ti]=btn.dataset.delTop.split('-').map(Number);
          siteData.customizerCategories[ci].toppings.splice(ti,1);
          dirty=true; markDirty(); render();
        });
      });
      container.querySelectorAll('[data-del-cat]').forEach(btn=>{
        btn.addEventListener('click',()=>{
          if(!confirm('Delete this category?')) return;
          siteData.customizerCategories.splice(parseInt(btn.dataset.delCat),1);
          dirty=true; markDirty(); render();
        });
      });
      container.querySelectorAll('[data-add-top]').forEach(btn=>{
        btn.addEventListener('click',()=>{
          siteData.customizerCategories[parseInt(btn.dataset.addTop)].toppings.push({name:'New Topping',price:2});
          dirty=true; markDirty(); render();
        });
      });
    }
    const acb=document.getElementById('addCategoryBtn');
    if(acb){
      const fresh=acb.cloneNode(true); acb.parentNode.replaceChild(fresh,acb);
      fresh.addEventListener('click',()=>{
        const name=prompt('Category name:'); if(!name||!name.trim()) return;
        siteData.customizerCategories=siteData.customizerCategories||[];
        siteData.customizerCategories.push({id:'cat_'+Date.now(),name:name.trim(),toppings:[]});
        dirty=true; markDirty(); render();
      });
    }
    render();
  }
 
  // ════════════════════════════════════════════════════════════
  //  FOOTER EDITOR  — two locations + social + email + legal
  // ════════════════════════════════════════════════════════════
  function renderFooterEditor() {
    const view = document.getElementById('view-footer');
    if (!view) return;
 
    view.innerHTML = `
      <div class="container" style="padding:80px 0;">
        <div class="admin-section-label">Footer Editor</div>
        <p style="color:var(--color-ivory-dim);margin-bottom:32px;font-size:14px;">
          Edit all footer content. Changes apply to every page after Publish.
        </p>
        <div class="fed-grid">
 
          <!-- Brand + tagline -->
          <div class="fed-card">
            <div class="fed-card__title">Brand</div>
            <div class="fed-field">
              <span class="fed-label">Brand Name</span>
              <input class="fed-input" type="text" id="fedBrand" value="${esc(siteData.footer.brand||'')}" />
            </div>
            <div class="fed-field">
              <span class="fed-label">Tagline</span>
              <input class="fed-input" type="text" id="fedTagline" value="${esc(siteData.footer.tagline||'')}" placeholder="Short tagline under brand name" />
            </div>
            <div class="fed-field">
              <span class="fed-label">Legal / Copyright</span>
              <input class="fed-input" type="text" id="fedLegal" value="${esc(siteData.footer.legal||'')}" />
            </div>
          </div>
 
          <!-- Contact -->
          <div class="fed-card">
            <div class="fed-card__title">Contact</div>
            <div class="fed-field">
              <span class="fed-label">Email</span>
              <input class="fed-input" type="email" id="fedEmail" value="${esc(siteData.footer.email||'')}" placeholder="hello@stacheys.com" />
            </div>
            <div class="fed-field" style="margin-top:24px;padding-top:24px;border-top:1px solid var(--color-line);">
              <span class="fed-label">Social — Instagram URL</span>
              <input class="fed-input" type="url" id="fedInsta" value="${esc((siteData.footer.social&&siteData.footer.social.instagram)||'')}" placeholder="https://instagram.com/…" />
            </div>
            <div class="fed-field">
              <span class="fed-label">Social — Facebook URL</span>
              <input class="fed-input" type="url" id="fedFb" value="${esc((siteData.footer.social&&siteData.footer.social.facebook)||'')}" placeholder="https://facebook.com/…" />
            </div>
            <div class="fed-field">
              <span class="fed-label">Social — Yelp URL</span>
              <input class="fed-input" type="url" id="fedYelp" value="${esc((siteData.footer.social&&siteData.footer.social.yelp)||'')}" placeholder="https://yelp.com/biz/…" />
            </div>
          </div>
 
          <!-- Locations — spans full width -->
          <div class="fed-card" style="grid-column:1/-1;">
            <div class="fed-card__title">Locations</div>
            <p style="color:var(--color-ivory-dim);font-size:13px;margin-bottom:24px;">Each location appears as its own column in the footer.</p>
            <div id="fedLocations"></div>
            <button class="fed-add-loc" id="fedAddLoc">＋ Add Location</button>
          </div>
 
        </div>
      </div>
    `;
 
    function renderLocations() {
      const container = document.getElementById('fedLocations');
      if (!container) return;
      const locs = siteData.footer.locations||[];
      container.innerHTML = locs.map((loc,i) => `
        <div class="fed-loc-card" data-loc-idx="${i}">
          <div class="fed-loc-title">Location ${i+1}</div>
          <button class="fed-del-loc" data-del-loc="${i}">✕ Remove</button>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="fed-field">
              <span class="fed-label">Label (e.g. North Andover)</span>
              <input class="fed-input" type="text" value="${esc(loc.label||'')}" data-loc="${i}" data-lf="label" />
            </div>
            <div class="fed-field">
              <span class="fed-label">Phone</span>
              <input class="fed-input" type="tel" value="${esc(loc.phone||'')}" data-loc="${i}" data-lf="phone" />
            </div>
            <div class="fed-field">
              <span class="fed-label">Street Address</span>
              <input class="fed-input" type="text" value="${esc(loc.address||'')}" data-loc="${i}" data-lf="address" />
            </div>
            <div class="fed-field">
              <span class="fed-label">City / State / Zip</span>
              <input class="fed-input" type="text" value="${esc(loc.city||'')}" data-loc="${i}" data-lf="city" />
            </div>
            <div class="fed-field">
              <span class="fed-label">Hours Line 1</span>
              <input class="fed-input" type="text" value="${esc(loc.hours||'')}" placeholder="Mon–Thu 11am–10pm" data-loc="${i}" data-lf="hours" />
            </div>
            <div class="fed-field">
              <span class="fed-label">Hours Line 2</span>
              <input class="fed-input" type="text" value="${esc(loc.hours2||'')}" placeholder="Fri–Sun 11am–11pm" data-loc="${i}" data-lf="hours2" />
            </div>
          </div>
        </div>
      `).join('');
 
      // Location field inputs
      container.querySelectorAll('[data-loc][data-lf]').forEach(inp => {
        inp.addEventListener('input', () => {
          const i = parseInt(inp.dataset.loc);
          siteData.footer.locations[i][inp.dataset.lf] = inp.value;
          dirty=true; markDirty();
        });
      });
 
      // Delete location
      container.querySelectorAll('[data-del-loc]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!confirm('Remove this location?')) return;
          siteData.footer.locations.splice(parseInt(btn.dataset.delLoc),1);
          dirty=true; markDirty();
          renderLocations();
        });
      });
    }
 
    renderLocations();
 
    // Add location
    document.getElementById('fedAddLoc').addEventListener('click', () => {
      siteData.footer.locations = siteData.footer.locations||[];
      siteData.footer.locations.push({ label:'New Location', address:'', city:'', hours:'', hours2:'', phone:'' });
      dirty=true; markDirty();
      renderLocations();
    });
 
    // Top-level field listeners (brand, tagline, legal, email, social)
    const wire = (id, path) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        // path like 'footer.brand' or 'footer.social.instagram'
        const parts = path.split('.');
        let obj = siteData;
        for (let k=0; k<parts.length-1; k++) { obj[parts[k]]=obj[parts[k]]||{}; obj=obj[parts[k]]; }
        obj[parts[parts.length-1]] = el.value;
        dirty=true; markDirty();
      });
    };
    wire('fedBrand',   'footer.brand');
    wire('fedTagline', 'footer.tagline');
    wire('fedLegal',   'footer.legal');
    wire('fedEmail',   'footer.email');
    wire('fedInsta',   'footer.social.instagram');
    wire('fedFb',      'footer.social.facebook');
    wire('fedYelp',    'footer.social.yelp');
  }
 
  // ════════════════════════════════════════════════════════════
  //  CUSTOM PAGES
  // ════════════════════════════════════════════════════════════
  function addNewPage() {
    const title = prompt('New page name:');
    if (!title||!title.trim()) return;
    const id = 'page_'+Date.now();
    siteData.customPages = siteData.customPages||[];
    siteData.customPages.push({ id, title:title.trim(),
      slug:title.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''),
      sections:[{heading:'Section Title',text:'Write your content here.',image:''}]
    });
    dirty=true; markDirty();
    buildTabs(); renderCustomPageViews();
    const btn=document.querySelector(`[data-view="custom-${id}"]`);
    if (btn) switchView('custom-'+id,btn);
    if (window.showToast) window.showToast(`"${title.trim()}" created`);
  }
 
  function renderCustomPageViews() {
    document.querySelectorAll('.admin-view[data-custom-page]').forEach(el=>el.remove());
    if (!siteData.customPages) return;
    siteData.customPages.forEach(page => {
      const view = document.createElement('div');
      view.id='view-custom-'+page.id; view.className='admin-view'; view.dataset.customPage=page.id;
      const secHtml = page.sections.map((sec,idx)=>`
        <div class="custom-page-block" data-section-idx="${idx}">
          <button class="custom-page-block__delete" data-del-sec="${idx}">✕ Remove Section</button>
          <h2 class="story__heading" contenteditable="true" data-field="heading"
              style="font-size:clamp(28px,3vw,48px);margin-bottom:16px;">${esc(sec.heading)}</h2>
          <p class="story__copy" contenteditable="true" data-field="text" style="margin-bottom:16px;">${esc(sec.text)}</p>
          ${sec.image
            ? `<div class="img-edit-wrap" data-add-img="${idx}"><img src="${esc(sec.image)}" alt="" style="max-width:100%;aspect-ratio:16/9;object-fit:cover;" /></div>
               <span style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--color-accent-bright);cursor:pointer;display:block;margin-top:6px;" data-add-img="${idx}">✎ Change image</span>`
            : `<button class="add-block-btn" data-add-img="${idx}" style="padding:12px;margin-top:0;">📷 Add Image</button>`
          }
        </div>`).join('');
      view.innerHTML=`
        <main class="site-shell">
          <div class="container" style="padding:80px 0;">
            <div class="admin-section-label">Custom Page: ${esc(page.title)}</div>
            <h1 class="menu-title" contenteditable="true" data-page-title="${page.id}" style="margin-bottom:48px;">${esc(page.title)}</h1>
            <div data-page-sections="${page.id}">${secHtml}</div>
            <button class="add-block-btn" data-add-sec="${page.id}">➕ Add Section</button>
            <button class="delete-page-btn" data-del-page="${page.id}">🗑 Delete Page</button>
          </div>
        </main>`;
      document.body.appendChild(view);
      view.querySelectorAll('[data-del-sec]').forEach(btn=>{
        btn.addEventListener('click',()=>{ page.sections.splice(parseInt(btn.dataset.delSec),1); dirty=true; markDirty(); renderCustomPageViews(); switchView('custom-'+page.id,document.querySelector(`[data-view="custom-${page.id}"]`)); });
      });
      view.querySelector(`[data-add-sec]`).addEventListener('click',()=>{ page.sections.push({heading:'New Section',text:'Write content here.',image:''}); dirty=true; markDirty(); renderCustomPageViews(); switchView('custom-'+page.id,document.querySelector(`[data-view="custom-${page.id}"]`)); });
      view.querySelector(`[data-del-page]`).addEventListener('click',()=>{ if(!confirm(`Delete "${page.title}"?`)) return; siteData.customPages=siteData.customPages.filter(p=>p.id!==page.id); dirty=true; markDirty(); buildTabs(); renderCustomPageViews(); switchView('home',document.querySelector('[data-view="home"]')); });
      view.querySelectorAll('[data-add-img]').forEach(el=>{ el.addEventListener('click',()=>{ const idx=parseInt(el.dataset.addImg); const url=prompt('Image URL:',page.sections[idx]&&page.sections[idx].image||''); if(url!==null){page.sections[idx].image=url; dirty=true; markDirty(); renderCustomPageViews(); switchView('custom-'+page.id,document.querySelector(`[data-view="custom-${page.id}"]`));} }); });
    });
  }

  // ════════════════════════════════════════════════════════════
  //  ORDERS DASHBOARD LOGIC
  // ════════════════════════════════════════════════════════════
  let knownOrderIds = new Set();
  let firstOrderLoad = true;

  function playNewOrderChime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      gain1.gain.setValueAtTime(0.2, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.35);
      
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
        gain2.gain.setValueAtTime(0.25, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.45);
      }, 150);
    } catch (e) {
      console.warn('Web Audio playback failed or blocked:', e);
    }
  }

  function formatTime(isoString) {
    try {
      const d = new Date(isoString);
      const diffMs = Date.now() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  async function updateOrderStatus(orderId, nextStatus) {
    try {
      const res = await fetch('/api/orders/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status: nextStatus })
      });
      const data = await res.json();
      if (data.ok) {
        refreshOrdersBoard();
        if (window.showToast) window.showToast(`Order status updated to "${nextStatus}"`);
      } else {
        alert('Failed to update order status: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error communicating with server.');
    }
  }

  async function refreshOrdersBoard() {
    const listNew = document.getElementById('list-new');
    if (!listNew) return; // Not on admin page or not fully initialized

    try {
      const res = await fetch('/api/orders?' + Date.now());
      if (!res.ok) return;
      const data = await res.json();
      if (!data.ok || !data.orders) return;

      const orders = data.orders;
      
      // Check for new orders to trigger audio chime
      let hasNewOrder = false;
      orders.forEach(order => {
        if (!knownOrderIds.has(order.id)) {
          knownOrderIds.add(order.id);
          if (!firstOrderLoad) {
            hasNewOrder = true;
          }
        }
      });
      
      if (firstOrderLoad) {
        firstOrderLoad = false;
      }

      if (hasNewOrder) {
        playNewOrderChime();
        if (window.showToast) window.showToast('🍕 New order received!');
      }

      // Group orders by status
      const grouped = { new: [], preparing: [], ready: [], completed: [] };
      orders.forEach(order => {
        if (grouped[order.status]) {
          grouped[order.status].push(order);
        }
      });

      // Update counters
      ['new', 'preparing', 'ready', 'completed'].forEach(status => {
        const countSpan = document.getElementById(`count-${status}`);
        if (countSpan) countSpan.textContent = grouped[status].length;
      });

      // Render cards in columns
      ['new', 'preparing', 'ready', 'completed'].forEach(status => {
        const listContainer = document.getElementById(`list-${status}`);
        if (!listContainer) return;

        const columnOrders = grouped[status];
        if (columnOrders.length === 0) {
          listContainer.innerHTML = `<div style="color:var(--color-ivory-muted); font-size:12px; text-align:center; padding: 24px 0; border: 1px dashed var(--color-line);">Empty</div>`;
          return;
        }

        listContainer.innerHTML = columnOrders.map(order => {
          const formattedItems = order.items.map(it => `
            <div class="order-card-item">
              <div>
                <span class="order-card-item-name">${esc(it.name)}</span>
                ${it.meta ? `<span class="order-card-item-meta">${esc(it.meta)}</span>` : ''}
              </div>
              <span style="font-family:var(--font-serif);">$${parseFloat(it.price).toFixed(2)}</span>
            </div>
          `).join('');

          let actionBtn = '';
          if (status === 'new') {
            actionBtn = `<button class="order-card-btn" data-action-id="${order.id}" data-action-status="preparing">Accept &amp; Prepare 🍕</button>`;
          } else if (status === 'preparing') {
            actionBtn = `<button class="order-card-btn" data-action-id="${order.id}" data-action-status="ready">Mark as Ready 📦</button>`;
          } else if (status === 'ready') {
            actionBtn = `<button class="order-card-btn" data-action-id="${order.id}" data-action-status="completed">Complete Order ✓</button>`;
          }

          const deliveryDetails = order.orderType === 'delivery'
            ? `<div style="margin-top:4px;"><strong>Address:</strong> ${esc(order.deliveryAddress)}</div>`
            : '';

          const paymentBadge = order.stripeSessionId
            ? `<span class="badge badge--paid">Card / Paid</span>`
            : `<span class="badge badge--cash">Cash</span>`;

          const typeBadge = order.orderType === 'delivery'
            ? `<span class="badge badge--delivery">Delivery</span>`
            : `<span class="badge badge--pickup">Pickup</span>`;

          return `
            <div class="order-card" id="card-${order.id}">
              <div class="order-card-header">
                <span class="order-card-id">${esc(order.id)}</span>
                <span class="order-card-time">${formatTime(order.createdAt)}</span>
              </div>
              <div class="order-card-details">
                <div><strong>Customer:</strong> ${esc(order.customer.name)}</div>
                <div><strong>Phone:</strong> <a href="tel:${esc(order.customer.phone)}" style="color:var(--color-accent-bright); text-decoration:underline;">${esc(order.customer.phone)}</a></div>
                <div style="display:flex; gap: 8px; margin-top: 4px;">
                  ${typeBadge}
                  ${paymentBadge}
                </div>
                ${deliveryDetails}
              </div>
              <div class="order-card-items">
                ${formattedItems}
                ${order.orderType === 'delivery' ? `
                  <div class="order-card-item" style="border-top:1px dashed var(--color-line); padding-top:6px; margin-top:4px;">
                    <span style="color:var(--color-ivory-muted);">Delivery Fee</span>
                    <span style="font-family:var(--font-serif);">$4.00</span>
                  </div>
                ` : ''}
              </div>
              <div class="order-card-total-row">
                <span style="font-size:10px; color:var(--color-ivory-muted); text-transform:uppercase; letter-spacing:0.1em;">Total</span>
                <span class="order-card-total">$${parseFloat(order.total).toFixed(2)}</span>
              </div>
              ${actionBtn}
            </div>
          `;
        }).join('');
      });

      // Hook up card buttons
      document.querySelectorAll('[data-action-id][data-action-status]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.actionId;
          const targetStatus = btn.dataset.actionStatus;
          updateOrderStatus(id, targetStatus);
        });
      });

    } catch (err) {
      console.error("Error refreshing orders board:", err);
    }
  }
 
  // ════════════════════════════════════════════════════════════
  //  PUBLISH
  // ════════════════════════════════════════════════════════════
  function handlePublish() {
    const btn = document.getElementById('publishBtn');
 
    // ── Home ──
    const titleEl=document.querySelector('[data-edit-target="heroTitle"]');
    if(titleEl) siteData.heroTitle=titleEl.innerHTML.trim();
    const leadEl=document.querySelector('[data-edit-target="heroLead"]');
    if(leadEl)  siteData.heroLead=leadEl.textContent.trim();
    const metaEl=document.querySelector('[data-edit-target="heroMeta"]');
    if(metaEl)  siteData.heroMeta=Array.from(metaEl.children).map(c=>c.textContent.trim()).filter(Boolean);
    const mg=document.querySelector('[data-edit-target="metricsGrid"]');
    if(mg) {
      siteData.metrics=[];
      mg.querySelectorAll(':scope>div').forEach(col=>{
        const vSpan=col.querySelector('.metric__value span'); const lDiv=col.querySelector('.metric__label');
        const suf=col.querySelector('.metric__value span:last-child');
        if(vSpan&&lDiv) siteData.metrics.push({value:parseInt(vSpan.textContent)||0,label:lDiv.textContent.trim(),suffix:(suf&&suf!==vSpan)?suf.textContent.trim():''});
      });
    }
 
    // ── Story ──
    const ss=document.querySelector('[data-edit-target="storySection"]');
    if(ss){const i=ss.querySelector('.story__index'),h=ss.querySelector('.story__heading'),c=ss.querySelector('.story__copy');if(i)siteData.storySection.eyebrow=i.textContent.trim();if(h)siteData.storySection.heading=h.innerHTML.trim();if(c)siteData.storySection.copy=c.textContent.trim();}
    const ps=document.querySelector('[data-edit-target="promiseSection"]');
    if(ps){const i=ps.querySelector('.story__index'),h=ps.querySelector('.story__heading'),c=ps.querySelector('.story__copy');if(i)siteData.promiseSection.eyebrow=i.textContent.trim();if(h)siteData.promiseSection.heading=h.innerHTML.trim();if(c)siteData.promiseSection.copy=c.textContent.trim();}
    const ae=document.querySelector('[data-edit-target="visitAddress"]');
    if(ae){const parts=ae.innerHTML.split(/<br\s*\/?>/i);siteData.visitAddress=(parts[0]||'').replace(/<[^>]*>/g,'').replace(/,\s*$/,'').trim();siteData.visitCity=(parts[1]||'').replace(/<[^>]*>/g,'').trim();}
    const ce=document.querySelector('[data-edit-target="visitCopy"]');
    if(ce) siteData.visitCopy=ce.textContent.trim();
 
    // ── Menu — already live-synced to siteData.menuItems via input events ──
    // (nothing extra to scrape)
 
    // ── Custom pages ──
    (siteData.customPages||[]).forEach(page=>{
      const te=document.querySelector(`[data-page-title="${page.id}"]`);
      if(te) page.title=te.textContent.trim();
      const sc=document.querySelector(`[data-page-sections="${page.id}"]`);
      if(sc) sc.querySelectorAll('.custom-page-block').forEach((block,idx)=>{
        if(!page.sections[idx]) return;
        const h=block.querySelector('[data-field="heading"]'),t=block.querySelector('[data-field="text"]'),i=block.querySelector('img');
        if(h) page.sections[idx].heading=h.innerHTML.trim();
        if(t) page.sections[idx].text=t.textContent.trim();
        if(i) page.sections[idx].image=i.src;
      });
    });
 
    // ── POST ──
    btn.textContent='Publishing…'; btn.disabled=true;
    fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(siteData)})
    .then(r=>r.json())
    .then(result=>{
      btn.textContent='Publish Changes'; btn.disabled=false;
      if(result.ok){ markClean(); if(window.showToast) window.showToast('✓ Published — site-data.json saved'); }
      else alert('Server error: '+(result.error||'unknown'));
    })
    .catch(err=>{
      btn.textContent='Publish Changes'; btn.disabled=false;
      alert('Cannot reach server.\n\nRun:  node server.js\nOpen: http://localhost:3001/admin.html\n\nDo not open as a file:// URL.');
      console.error(err);
    });
  }
 
  // ── Helpers ────────────────────────────────────────────────
  function makeEditable(el){ if(el) el.setAttribute('contenteditable','true'); }
  function makeImageEditable(img, cb){
    if(!img||img.dataset.editReady) return;
    img.dataset.editReady='1'; img.style.cursor='pointer';
    const wrap=document.createElement('div'); wrap.className='img-edit-wrap'; wrap.style.cssText='display:block;width:100%;';
    img.parentNode.insertBefore(wrap,img); wrap.appendChild(img);
    wrap.addEventListener('click',()=>{ const url=prompt('Image URL:',img.src); if(url!==null&&url.trim()){img.src=url.trim();if(cb)cb(url.trim());dirty=true;markDirty();}});
  }
  function esc(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
 
})();