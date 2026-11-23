import {
  buildDeliveryWhatsAppMessage,
  buildWhatsAppUrl,
  calculateCartTotals,
  calculateCashChange,
  escapeHtml,
  formatBRL,
  isBusinessOpen,
} from '../../shared/order-utils.mjs';

const client = JSON.parse(document.getElementById('client-data').textContent || '{}');
const agency = JSON.parse(document.getElementById('agency-data').textContent || '{}');

const state = {
  activeCategory: 'all',
  searchQuery: '',
  cart: [],
  deliveryMode: 'delivery',
  neighborhoodId: client.neighborhoods?.[0]?.id || '',
  paymentMethod: 'Pix',
  cashChangeFor: '',
  customerName: '',
  address: '',
  reference: '',
  modalItem: null,
  modalVariantId: null,
  modalAddonIds: new Set(),
  modalQty: 1,
};

let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function openAnimatedModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = false;
  el.classList.remove('is-closing');
  void el.offsetHeight;
  el.classList.add('is-open');
}

function closeAnimatedModal(id) {
  const el = document.getElementById(id);
  if (!el || el.hidden) return;
  el.classList.remove('is-open');
  el.classList.add('is-closing');
  setTimeout(() => {
    el.hidden = true;
    el.classList.remove('is-closing');
  }, 160);
}

function triggerInputShake(inputEl) {
  if (!inputEl) return;
  inputEl.classList.add('is-error');
  inputEl.classList.remove('is-shaking');
  void inputEl.offsetWidth;
  inputEl.classList.add('is-shaking');
  setTimeout(() => inputEl.classList.remove('is-shaking'), 320);
  if (inputEl._revertTimer) clearTimeout(inputEl._revertTimer);
  inputEl._revertTimer = setTimeout(() => {
    inputEl.classList.remove('is-error');
  }, 2600);
}

function animateNumber(el, text) {
  el.classList.remove('t-digit-group', 'is-animating');
  const chars = text.split('');
  el.replaceChildren();
  chars.forEach((ch, idx) => {
    const span = document.createElement('span');
    span.className = 't-digit';
    span.textContent = ch === ' ' ? '\u00a0' : ch;
    if (idx === chars.length - 2) span.dataset.stagger = '1';
    else if (idx === chars.length - 1) span.dataset.stagger = '2';
    el.appendChild(span);
  });
  el.classList.add('t-digit-group');
  void el.offsetHeight;
  el.classList.add('is-animating');
}

function getInitials(name) {
  return String(name || 'SG')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function applyTheme() {
  const root = document.documentElement;
  root.setAttribute('data-theme', client.theme === 'dark' ? 'dark' : 'light');
  if (client.primaryColor) {
    root.style.setProperty('--primary', client.primaryColor);
  }
  if (client.accentColor) {
    root.style.setProperty('--accent', client.accentColor);
  }
}

function renderHero() {
  if (client.previewMode) {
    document.getElementById('preview-banner').hidden = false;
    document.getElementById('preview-client-name').textContent = client.name || '';
  }

  const coverImg = document.getElementById('hero-cover-img');
  if (client.coverImage) {
    coverImg.src = client.coverImage;
    coverImg.onerror = () => {
      coverImg.style.display = 'none';
    };
  } else {
    coverImg.style.display = 'none';
  }

  const monogramEl = document.getElementById('store-monogram');
  if (client.logoImage) {
    monogramEl.classList.add('has-logo');
    monogramEl.innerHTML = `<img src="${escapeHtml(client.logoImage)}" alt="Logo ${escapeHtml(client.name)}" class="brand-logo-img" />`;
    const logoImg = monogramEl.querySelector('img');
    logoImg.onerror = () => {
      monogramEl.classList.remove('has-logo');
      monogramEl.textContent = getInitials(client.name);
    };
  } else {
    monogramEl.classList.remove('has-logo');
    monogramEl.textContent = getInitials(client.name);
  }
  document.getElementById('store-name').textContent = client.name || 'Cardápio Digital';
  document.getElementById('store-tagline').textContent = client.tagline || '';

  const openInfo = isBusinessOpen(client.businessHours);
  const statusBadge = document.getElementById('status-badge');
  statusBadge.textContent = openInfo.todayWindow
    ? `${openInfo.label} · ${openInfo.todayWindow}`
    : openInfo.label;
  statusBadge.classList.toggle('is-open', openInfo.isOpen);
  statusBadge.classList.toggle('is-closed', !openInfo.isOpen);

  document.getElementById('prep-time-badge').textContent = `Preparo ${client.prepTime || '30–45 min'}`;
  document.getElementById('min-order-badge').textContent =
    Number(client.minOrder || 0) > 0
      ? `Pedido mín. ${formatBRL(client.minOrder)}`
      : 'Sem pedido mínimo';

  const freeBadge = document.getElementById('free-delivery-badge');
  if (Number(client.freeDeliveryAbove || 0) > 0) {
    freeBadge.hidden = false;
    freeBadge.textContent = `Frete grátis acima de ${formatBRL(client.freeDeliveryAbove)}`;
  }

  const metaParts = [client.address, client.city].filter(Boolean);
  document.getElementById('store-address').textContent = metaParts.join(' · ');
  document.getElementById('footer-store-hours').textContent =
    client.hoursSummary || (openInfo.detail ? `Horário: ${openInfo.detail}` : '');
  const footerAgencyLink = document.getElementById('footer-agency-link');
  if (footerAgencyLink) {
    footerAgencyLink.textContent = `Feito com ${agency.brandName || 'GGDevStudio'}`;
  }
}

function renderCategories() {
  const host = document.getElementById('category-pills');
  const categories = [{ id: 'all', name: 'Todos' }, ...(client.categories || [])];
  host.innerHTML = categories
    .map(
      (cat) => `
      <button
        type="button"
        class="cat-pill t-pressable ${state.activeCategory === cat.id ? 'active' : ''}"
        data-category-id="${escapeHtml(cat.id)}"
      >${escapeHtml(cat.name)}</button>
    `
    )
    .join('');

  host.querySelectorAll('.cat-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeCategory = btn.dataset.categoryId;
      renderCategories();
      renderMenu();
    });
  });
}

function getItemDisplayPrice(item) {
  if (Array.isArray(item.variants) && item.variants.length > 0) {
    const minPrice = Math.min(...item.variants.map((v) => Number(v.price || 0)));
    return `A partir de ${formatBRL(minPrice)}`;
  }
  return formatBRL(item.price || 0);
}

function renderMenu() {
  const host = document.getElementById('menu-sections');
  const query = state.searchQuery.trim().toLowerCase();
  const categories = client.categories || [];
  const allItems = client.items || [];

  const visibleCats =
    state.activeCategory === 'all'
      ? categories
      : categories.filter((c) => c.id === state.activeCategory);

  const sectionsHtml = [];
  for (const cat of visibleCats) {
    const catItems = allItems.filter((item) => {
      if (item.categoryId !== cat.id) return false;
      if (!query) return true;
      const hay = `${item.name} ${item.description || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(query);
    });

    if (catItems.length === 0) continue;

    const cardsHtml = catItems
      .map((item) => {
        const tagsHtml = (item.tags || [])
          .map((t) => `<span class="item-tag">${escapeHtml(t)}</span>`)
          .join('');
        const thumbHtml = item.image
          ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.remove();" />`
          : `<span class="thumb-fallback">${escapeHtml(getInitials(item.name))}</span>`;

        return `
          <button type="button" class="menu-card t-card-lift" data-item-id="${escapeHtml(item.id)}">
            <div class="menu-card-info">
              <div>
                ${tagsHtml ? `<div class="menu-card-tags">${tagsHtml}</div>` : ''}
                <h3 class="menu-card-name">${escapeHtml(item.name)}</h3>
                <p class="menu-card-desc">${escapeHtml(item.description || '')}</p>
              </div>
              <div class="menu-card-bottom">
                <span class="menu-card-price">${escapeHtml(getItemDisplayPrice(item))}</span>
                <span class="menu-card-add-chip">+ Escolher</span>
              </div>
            </div>
            <div class="menu-card-thumb">${thumbHtml}</div>
          </button>
        `;
      })
      .join('');

    sectionsHtml.push(`
      <section class="menu-section" data-cat="${escapeHtml(cat.id)}">
        <h2 class="menu-cat-title">${escapeHtml(cat.name)}</h2>
        <div class="menu-list">${cardsHtml}</div>
      </section>
    `);
  }

  if (sectionsHtml.length === 0) {
    host.innerHTML = `<div class="empty-state">Nenhum item encontrado para "${escapeHtml(state.searchQuery)}".</div>`;
    return;
  }

  host.innerHTML = sectionsHtml.join('');
  host.querySelectorAll('.menu-card').forEach((card) => {
    card.addEventListener('click', () => {
      const item = allItems.find((i) => i.id === card.dataset.itemId);
      if (item) openProductModal(item);
    });
  });
}

function getModalUnitTotal() {
  const item = state.modalItem;
  if (!item) return 0;
  let base = Number(item.price || 0);
  if (Array.isArray(item.variants) && item.variants.length > 0) {
    const selectedVar = item.variants.find((v) => v.id === state.modalVariantId) || item.variants[0];
    base = Number(selectedVar?.price ?? base);
  }
  const addonsSum = (item.addons || []).reduce(
    (sum, addon) => (state.modalAddonIds.has(addon.id) ? sum + Number(addon.price || 0) : sum),
    0
  );
  return (base + addonsSum) * state.modalQty;
}

function updateProductModalPrice() {
  const addBtn = document.getElementById('pm-add-btn');
  addBtn.textContent = `Adicionar • ${formatBRL(getModalUnitTotal())}`;
  document.getElementById('pm-qty-val').textContent = String(state.modalQty);
}

function openProductModal(item) {
  state.modalItem = item;
  state.modalQty = 1;
  state.modalAddonIds = new Set();
  state.modalVariantId = item.variants?.[0]?.id || null;

  const photoWrap = document.getElementById('pm-photo-wrap');
  const photoEl = document.getElementById('pm-photo');
  if (item.image) {
    photoEl.src = item.image;
    photoEl.alt = item.name;
    photoEl.onerror = () => {
      photoWrap.hidden = true;
    };
    photoWrap.hidden = false;
  } else {
    photoWrap.hidden = true;
  }

  document.getElementById('pm-tags').innerHTML = (item.tags || [])
    .map((t) => `<span class="item-tag">${escapeHtml(t)}</span>`)
    .join('');
  document.getElementById('pm-title').textContent = item.name;
  document.getElementById('pm-desc').textContent = item.description || '';
  document.getElementById('pm-notes').value = '';

  const variantsWrap = document.getElementById('pm-variants-wrap');
  const variantsList = document.getElementById('pm-variants-list');
  if (Array.isArray(item.variants) && item.variants.length > 0) {
    variantsWrap.hidden = false;
    variantsList.innerHTML = item.variants
      .map(
        (v, idx) => `
        <label class="option-row">
          <span class="option-row-left">
            <input type="radio" name="pm-variant" value="${escapeHtml(v.id)}" ${idx === 0 ? 'checked' : ''} />
            <span>${escapeHtml(v.name)}</span>
          </span>
          <span class="option-row-price">${formatBRL(v.price)}</span>
        </label>
      `
      )
      .join('');
    variantsList.querySelectorAll('input[name="pm-variant"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        state.modalVariantId = radio.value;
        updateProductModalPrice();
      });
    });
  } else {
    variantsWrap.hidden = true;
    variantsList.innerHTML = '';
  }

  const addonsWrap = document.getElementById('pm-addons-wrap');
  const addonsList = document.getElementById('pm-addons-list');
  if (Array.isArray(item.addons) && item.addons.length > 0) {
    addonsWrap.hidden = false;
    addonsList.innerHTML = item.addons
      .map(
        (a) => `
        <label class="option-row">
          <span class="option-row-left">
            <input type="checkbox" value="${escapeHtml(a.id)}" />
            <span>${escapeHtml(a.name)}</span>
          </span>
          <span class="option-row-price">+ ${formatBRL(a.price)}</span>
        </label>
      `
      )
      .join('');
    addonsList.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
      chk.addEventListener('change', () => {
        if (chk.checked) {
          state.modalAddonIds.add(chk.value);
        } else {
          state.modalAddonIds.delete(chk.value);
        }
        updateProductModalPrice();
      });
    });
  } else {
    addonsWrap.hidden = true;
    addonsList.innerHTML = '';
  }

  updateProductModalPrice();
  openAnimatedModal('product-modal');
}

function getSelectedNeighborhood() {
  return (
    (client.neighborhoods || []).find((n) => n.id === state.neighborhoodId) || {
      id: '',
      name: 'Entrega padrão',
      fee: Number(client.defaultDeliveryFee || 0),
    }
  );
}

function getCheckoutTotals() {
  const hood = getSelectedNeighborhood();
  return calculateCartTotals(
    state.cart,
    state.deliveryMode,
    hood.fee,
    client.freeDeliveryAbove || 0,
    client.minOrder || 0
  );
}

function buildCurrentOrderPayload() {
  const hood = getSelectedNeighborhood();
  const totals = getCheckoutTotals();
  return {
    items: state.cart,
    deliveryMode: state.deliveryMode,
    neighborhoodName: hood.name,
    neighborhoodFee: hood.fee,
    address: state.address.trim(),
    reference: state.reference.trim(),
    customerName: state.customerName.trim(),
    paymentMethod: state.paymentMethod,
    cashChangeFor: state.cashChangeFor ? Number(state.cashChangeFor) : 0,
    totals,
  };
}

function updateCartBar(animate = false) {
  const totals = getCheckoutTotals();
  const bar = document.getElementById('cart-bar');
  bar.hidden = totals.totalQuantity === 0;
  document.getElementById('cart-count-badge').textContent = String(totals.totalQuantity);
  const totalStr = formatBRL(totals.total);
  const barTotalEl = document.getElementById('cart-bar-total');
  if (animate && totals.totalQuantity > 0) {
    animateNumber(barTotalEl, totalStr);
  } else {
    barTotalEl.textContent = totalStr;
  }
}

function renderCartModal() {
  const listEl = document.getElementById('cart-items-list');
  if (state.cart.length === 0) {
    listEl.innerHTML = `<div class="empty-state">Sua sacola está vazia.</div>`;
  } else {
    listEl.innerHTML = state.cart
      .map((item, index) => {
        const addonsSum = (item.addons || []).reduce((s, a) => s + Number(a.price || 0), 0);
        const linePrice = (Number(item.basePrice) + addonsSum) * item.quantity;
        const details = [];
        if (item.variantName) details.push(item.variantName);
        if (item.addons?.length) details.push(`+ ${item.addons.map((a) => a.name).join(', ')}`);
        if (item.notes) details.push(`Obs: ${item.notes}`);
        return `
          <div class="cart-item-row">
            <div>
              <div class="cart-item-title">${item.quantity}x ${escapeHtml(item.name)}</div>
              ${details.length ? `<div class="cart-item-meta">${escapeHtml(details.join(' · '))}</div>` : ''}
              <div class="cart-item-meta tabular">${formatBRL(linePrice)}</div>
            </div>
            <div class="cart-item-actions">
              <button type="button" class="mini-btn" data-cart-dec="${index}" aria-label="Diminuir">−</button>
              <span class="tabular">${item.quantity}</span>
              <button type="button" class="mini-btn" data-cart-inc="${index}" aria-label="Aumentar">+</button>
            </div>
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('[data-cart-dec]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.cartDec);
        if (state.cart[idx].quantity > 1) {
          state.cart[idx].quantity -= 1;
        } else {
          state.cart.splice(idx, 1);
        }
        updateCartBar(true);
        renderCartModal();
        if (state.cart.length === 0) {
          closeAnimatedModal('cart-modal');
        }
      });
    });

    listEl.querySelectorAll('[data-cart-inc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.cartInc);
        state.cart[idx].quantity += 1;
        updateCartBar(true);
        renderCartModal();
      });
    });
  }

  const totals = getCheckoutTotals();

  const promoEl = document.getElementById('delivery-promo-banner');
  if (state.deliveryMode === 'delivery' && Number(client.freeDeliveryAbove || 0) > 0 && state.cart.length > 0) {
    promoEl.hidden = false;
    promoEl.textContent =
      totals.missingForFreeDelivery > 0
        ? `Falta ${formatBRL(totals.missingForFreeDelivery)} para você ganhar entrega grátis!`
        : 'Entrega grátis liberada neste pedido!';
  } else {
    promoEl.hidden = true;
  }

  document.getElementById('delivery-fields').hidden = state.deliveryMode === 'pickup';
  document.getElementById('co-subtotal').textContent = formatBRL(totals.subtotal);
  document.getElementById('co-fee').textContent =
    state.deliveryMode === 'pickup'
      ? 'Grátis (retirada)'
      : totals.deliveryFee === 0
        ? 'Grátis'
        : formatBRL(totals.deliveryFee);
  document.getElementById('co-total').textContent = formatBRL(totals.total);

  const minWarn = document.getElementById('co-min-order-msg');
  const sendBtn = document.getElementById('btn-send-whatsapp');
  if (!totals.meetsMinOrder && state.cart.length > 0) {
    minWarn.hidden = false;
    minWarn.textContent = `Pedido mínimo para entrega: ${formatBRL(client.minOrder)}. Falta ${formatBRL(totals.missingForMinOrder)} (ou selecione Retirar no balcão).`;
    sendBtn.disabled = true;
  } else {
    minWarn.hidden = true;
    sendBtn.disabled = state.cart.length === 0;
  }

  const pixBox = document.getElementById('pix-info-box');
  if (state.paymentMethod === 'Pix' && client.pixKey) {
    pixBox.hidden = false;
    document.getElementById('pix-key-text').textContent = client.pixKey;
  } else {
    pixBox.hidden = true;
  }

  const cashBox = document.getElementById('cash-change-box');
  const cashFeedback = document.getElementById('co-cash-feedback');
  if (state.paymentMethod === 'Dinheiro') {
    cashBox.hidden = false;
    if (state.cashChangeFor) {
      const changeInfo = calculateCashChange(totals.total, Number(state.cashChangeFor));
      cashFeedback.classList.toggle('error', !changeInfo.valid);
      cashFeedback.textContent = changeInfo.valid
        ? `Troco previsto: ${formatBRL(changeInfo.change)}`
        : changeInfo.error;
    } else {
      cashFeedback.classList.remove('error');
      cashFeedback.textContent = 'Deixe vazio se tiver o valor exato.';
    }
  } else {
    cashBox.hidden = true;
  }

  const msg = buildDeliveryWhatsAppMessage(client, buildCurrentOrderPayload());
  document.getElementById('co-message-preview').textContent = msg;
}

function setupCheckoutControls() {
  const selectEl = document.getElementById('co-neighborhood');
  const hoods = client.neighborhoods || [];
  if (hoods.length > 0) {
    selectEl.innerHTML = hoods
      .map(
        (h) =>
          `<option value="${escapeHtml(h.id)}">${escapeHtml(h.name)} (${h.fee === 0 ? 'Grátis' : formatBRL(h.fee)})</option>`
      )
      .join('');
    selectEl.value = state.neighborhoodId;
  } else {
    selectEl.innerHTML = `<option value="">Taxa padrão (${formatBRL(client.defaultDeliveryFee || 0)})</option>`;
  }

  selectEl.addEventListener('change', () => {
    state.neighborhoodId = selectEl.value;
    updateCartBar(true);
    renderCartModal();
  });

  document.querySelectorAll('[data-delivery-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.deliveryMode = btn.dataset.deliveryMode;
      document
        .querySelectorAll('[data-delivery-mode]')
        .forEach((b) => b.classList.toggle('active', b === btn));
      updateCartBar(true);
      renderCartModal();
    });
  });

  document.querySelectorAll('[data-payment]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.paymentMethod = btn.dataset.payment;
      document
        .querySelectorAll('[data-payment]')
        .forEach((b) => b.classList.toggle('active', b === btn));
      renderCartModal();
    });
  });

  const addrInput = document.getElementById('co-address');
  addrInput.addEventListener('input', (e) => {
    addrInput.classList.remove('is-error');
    state.address = e.target.value;
    renderCartModal();
  });

  document.getElementById('co-reference').addEventListener('input', (e) => {
    state.reference = e.target.value;
    renderCartModal();
  });

  const nameInput = document.getElementById('co-customer-name');
  nameInput.addEventListener('input', (e) => {
    nameInput.classList.remove('is-error');
    state.customerName = e.target.value;
    renderCartModal();
  });

  const cashInput = document.getElementById('co-cash-for');
  cashInput.addEventListener('input', (e) => {
    cashInput.classList.remove('is-error');
    state.cashChangeFor = e.target.value;
    renderCartModal();
  });

  document.getElementById('btn-copy-pix').addEventListener('click', async () => {
    if (!client.pixKey) return;
    try {
      await navigator.clipboard.writeText(client.pixKey);
      showToast('Chave Pix copiada!');
    } catch {
      showToast('Chave Pix: ' + client.pixKey);
    }
  });

  document.getElementById('btn-copy-order').addEventListener('click', async () => {
    const msg = buildDeliveryWhatsAppMessage(client, buildCurrentOrderPayload());
    try {
      await navigator.clipboard.writeText(msg);
      showToast('Resumo do pedido copiado!');
    } catch {
      showToast('Resumo pronto abaixo para copiar.');
    }
  });

  document.getElementById('btn-send-whatsapp').addEventListener('click', async () => {
    if (state.cart.length === 0) return;
    const totals = getCheckoutTotals();
    if (!totals.meetsMinOrder) {
      showToast(`Pedido mínimo para entrega: ${formatBRL(client.minOrder)}.`);
      return;
    }
    if (state.deliveryMode === 'delivery' && !state.address.trim()) {
      triggerInputShake(addrInput);
      showToast('Preencha seu endereço para a entrega.');
      addrInput.focus();
      return;
    }
    if (!state.customerName.trim()) {
      triggerInputShake(nameInput);
      showToast('Informe seu nome para identificar o pedido.');
      nameInput.focus();
      return;
    }
    if (state.paymentMethod === 'Dinheiro' && state.cashChangeFor) {
      const check = calculateCashChange(totals.total, Number(state.cashChangeFor));
      if (!check.valid) {
        triggerInputShake(cashInput);
        showToast(check.error);
        return;
      }
    }

    const msg = buildDeliveryWhatsAppMessage(client, buildCurrentOrderPayload());
    const url = buildWhatsAppUrl(client.whatsappNumber, msg);
    if (url) {
      window.open(url, '_blank', 'noopener');
      showToast('Abrindo pedido no WhatsApp...');
      return;
    }

    try {
      await navigator.clipboard.writeText(msg);
      showToast('Modo demonstração: pedido formatado e copiado! Na loja ativa abre direto no WhatsApp.');
    } catch {
      showToast('Modo demonstração: veja a mensagem pronta no bloco abaixo.');
    }
    const details = document.querySelector('.msg-preview-details');
    if (details) details.open = true;
  });
}

function setupModalsAndQr() {
  const qrTpl = document.getElementById('qr-svg-template');
  const qrContainer = document.getElementById('qr-svg-container');
  if (qrTpl && qrContainer) {
    qrContainer.appendChild(qrTpl.content.cloneNode(true));
  }

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeAnimatedModal(btn.dataset.closeModal);
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeAnimatedModal(backdrop.id);
    });
  });

  document.getElementById('btn-open-qr').addEventListener('click', () => {
    openAnimatedModal('qr-modal');
  });

  document.getElementById('btn-open-cart').addEventListener('click', () => {
    renderCartModal();
    openAnimatedModal('cart-modal');
  });

  document.getElementById('pm-qty-minus').addEventListener('click', () => {
    if (state.modalQty > 1) {
      state.modalQty -= 1;
      updateProductModalPrice();
    }
  });
  document.getElementById('pm-qty-plus').addEventListener('click', () => {
    state.modalQty += 1;
    updateProductModalPrice();
  });

  document.getElementById('pm-add-btn').addEventListener('click', () => {
    const item = state.modalItem;
    if (!item) return;

    const selectedVar = item.variants?.find((v) => v.id === state.modalVariantId) || item.variants?.[0];
    const basePrice = Number(selectedVar?.price ?? item.price ?? 0);
    const addons = (item.addons || [])
      .filter((a) => state.modalAddonIds.has(a.id))
      .map((a) => ({ id: a.id, name: a.name, price: Number(a.price || 0) }));
    const notes = document.getElementById('pm-notes').value.trim();

    state.cart.push({
      id: item.id,
      name: item.name,
      variantName: selectedVar ? selectedVar.name : '',
      basePrice,
      addons,
      notes,
      quantity: state.modalQty,
    });

    closeAnimatedModal('product-modal');
    updateCartBar(true);
    showToast(`${item.name} adicionado à sacola!`);
  });

  const activateBtn = document.getElementById('btn-activate-preview');
  activateBtn.addEventListener('click', () => {
    const text = `Olá ${agency.ownerName || ''}! Vi a prévia do cardápio para ${client.name} e quero saber como ativar no ar.`;
    const waUrl = buildWhatsAppUrl(agency.whatsappNumber, text);
    if (waUrl) {
      window.open(waUrl, '_blank', 'noopener');
      return;
    }

    document.getElementById('ag-subtitle').textContent =
      `Prévia exclusiva preparada pela ${agency.brandName || 'SG Digital'}. Entrega completa em até 48h com QR Code A4 para embalagem e balcão.`;
    const plans = Object.values(agency.plans || {});
    document.getElementById('ag-plans').innerHTML = plans
      .map((p) => {
        const priceStr =
          p.monthlyFee > 0
            ? `${formatBRL(p.setupFee)} implantação + ${formatBRL(p.monthlyFee)}/mês`
            : `${formatBRL(p.setupFee)} pagamento único`;
        return `
          <div class="ag-plan-card">
            <h4>${escapeHtml(p.name)}</h4>
            <div class="ag-plan-price">${escapeHtml(priceStr)}</div>
            <p>${escapeHtml(p.description)}</p>
          </div>
        `;
      })
      .join('');
    openAnimatedModal('agency-modal');
  });

  document.getElementById('btn-ag-copy-pitch').addEventListener('click', async () => {
    const summary = `Quero ativar o Cardápio Digital da ${client.name} (${agency.brandName || 'SG Digital'}).`;
    try {
      await navigator.clipboard.writeText(summary);
      showToast('Texto copiado!');
    } catch {
      showToast(summary);
    }
  });
}

function setupSearch() {
  const input = document.getElementById('menu-search');
  const clearBtn = document.getElementById('btn-clear-search');
  input.addEventListener('input', () => {
    state.searchQuery = input.value;
    clearBtn.hidden = !input.value;
    renderMenu();
  });
  clearBtn.addEventListener('click', () => {
    input.value = '';
    state.searchQuery = '';
    clearBtn.hidden = true;
    renderMenu();
  });
}

applyTheme();
renderHero();
renderCategories();
renderMenu();
setupSearch();
setupCheckoutControls();
setupModalsAndQr();
updateCartBar(false);
