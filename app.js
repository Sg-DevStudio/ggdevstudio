import {
  buildWhatsAppUrl,
  calculateAppFeesSavings,
  escapeHtml,
  formatBRL,
} from './shared/order-utils.mjs';

const agency = JSON.parse(document.getElementById('agency-data').textContent || '{}');
const showcase = JSON.parse(document.getElementById('showcase-data').textContent || '[]');

let toastTimer = null;

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function animateNumber(el, text) {
  el.classList.remove('t-digit-group', 'is-animating');
  el.textContent = text;
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

function attachSpotlight(selector) {
  document.querySelectorAll(selector).forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      card.style.setProperty('--my', `${e.clientY - rect.top}px`);
    });
  });
}

function openAnimatedModal(backdropId) {
  const el = document.getElementById(backdropId);
  if (!el) return;
  el.hidden = false;
  el.classList.remove('is-closing');
  void el.offsetHeight;
  el.classList.add('is-open');
}

function closeAnimatedModal(backdropId) {
  const el = document.getElementById(backdropId);
  if (!el || el.hidden) return;
  el.classList.remove('is-open');
  el.classList.add('is-closing');
  setTimeout(() => {
    el.hidden = true;
    el.classList.remove('is-closing');
  }, 160);
}

function openContact(planName = '') {
  const msg = planName
    ? `Olá ${agency.ownerName || ''}! Quero uma prévia gratuita para o meu negócio (${planName}).`
    : `Olá ${agency.ownerName || ''}! Vi os exemplos da ${agency.brandName || 'SG Digital'} e quero solicitar minha prévia gratuita.`;
  const url = buildWhatsAppUrl(agency.whatsappNumber, msg);
  if (url) {
    window.open(url, '_blank', 'noopener');
    return;
  }

  document.getElementById('contact-modal-desc').textContent =
    'Configure seu WhatsApp em operacao/config.json para abrir seu atendimento direto. Enquanto isso, copie a mensagem modelo abaixo:';
  document.getElementById('contact-modal').dataset.copyText = msg;
  openAnimatedModal('contact-modal');
}

function setupBrand() {
  const brand = agency.brandName || 'GGDevStudio';
  const initials =
    agency.brandInitials ||
    String(brand)
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 2)
      .toUpperCase() ||
    'GG';
  const markEl = document.getElementById('brand-mark');
  if (markEl) markEl.textContent = initials;
  document.getElementById('brand-name').textContent = brand;
  document.getElementById('footer-brand').textContent = brand;
  if (agency.city) {
    document.getElementById('footer-city').textContent = `Atendimento em ${agency.city} e todo o Brasil`;
  }
  const launchPrice = agency.plans?.launch?.setupFee ?? 297;
  document.getElementById('hero-start-price').textContent = formatBRL(launchPrice);
}

function setupCalculator() {
  const revInput = document.getElementById('calc-revenue');
  const feeInput = document.getElementById('calc-fee');
  const migInput = document.getElementById('calc-migrated');
  let initialRun = true;

  function update() {
    const rev = Number(revInput.value);
    const fee = Number(feeInput.value);
    const mig = Number(migInput.value);
    const startCost = agency.plans?.start?.setupFee ?? 397;

    const res = calculateAppFeesSavings(rev, fee, mig, startCost);
    document.getElementById('calc-revenue-val').textContent = formatBRL(rev);
    document.getElementById('calc-fee-val').textContent = `${fee}%`;
    document.getElementById('calc-migrated-val').textContent = `${mig}%`;

    const lossText = formatBRL(res.monthlyLoss);
    const savedText = `${formatBRL(res.monthlySaved)} / mês`;
    const paybackText =
      res.paybackDays > 0 ? `Se paga em ~${res.paybackDays} dias` : 'Simulação zerada';

    if (initialRun) {
      document.getElementById('calc-monthly-loss').textContent = lossText;
      document.getElementById('calc-monthly-saved').textContent = savedText;
      initialRun = false;
    } else {
      animateNumber(document.getElementById('calc-monthly-loss'), lossText);
      animateNumber(document.getElementById('calc-monthly-saved'), savedText);
    }

    document.getElementById('calc-annual-loss').textContent = `${formatBRL(res.annualLoss)} por ano`;
    document.getElementById('calc-annual-saved').textContent = `${formatBRL(res.annualSaved)} por ano no seu caixa`;
    document.getElementById('calc-payback').textContent = paybackText;
  }

  revInput.addEventListener('input', update);
  feeInput.addEventListener('input', update);
  migInput.addEventListener('input', update);
  update();
}

function renderShowcase() {
  const grid = document.getElementById('showcase-grid');
  grid.innerHTML = showcase
    .map((item) => {
      const nicheLabel = item.template === 'servicos' ? 'Serviços & Agenda' : 'Delivery & Pedidos';
      const coverStyle = item.primaryColor
        ? `style="background: linear-gradient(135deg, ${escapeHtml(item.primaryColor)}, #171513);"`
        : '';
      const coverImg = item.coverImage
        ? `<img src="${escapeHtml(item.coverImage)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.remove();" />`
        : '';
      const logoHtml = item.logoImage
        ? `<img src="${escapeHtml(item.logoImage)}" alt="Logo ${escapeHtml(item.name)}" class="demo-brand-logo" loading="lazy" onerror="this.remove();" />`
        : '';

      return `
        <article class="demo-card t-card-lift rb-spotlight">
          <div class="demo-cover" ${coverStyle}>
            ${coverImg}
            <span class="demo-niche-pill">${escapeHtml(nicheLabel)}</span>
          </div>
          <div class="demo-body">
            <div>
              <div class="demo-title-row">
                ${logoHtml}
                <h3>${escapeHtml(item.name)}</h3>
              </div>
              <p>${escapeHtml(item.tagline || '')}</p>
            </div>
            <div class="demo-actions">
              <a href="./demos/${escapeHtml(item.slug)}/" class="btn btn-primary t-pressable">Abrir Demo ao Vivo</a>
              <a href="./demos/${escapeHtml(item.slug)}/qr-impressao.html" target="_blank" rel="noopener" class="btn btn-secondary t-pressable">Ver Kit QR A4</a>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderPlans() {
  const plans = Object.entries(agency.plans || {});
  const grid = document.getElementById('plans-grid');
  grid.innerHTML = plans
    .map(([key, plan]) => {
      const priceText =
        Number(plan.monthlyFee || 0) > 0
          ? `${formatBRL(plan.setupFee)} + ${formatBRL(plan.monthlyFee)}/mês`
          : `${formatBRL(plan.setupFee)} único`;
      const isFeatured = key === 'start';
      return `
        <article class="plan-card t-card-lift rb-spotlight ${isFeatured ? 'is-featured' : ''}">
          <div>
            ${isFeatured ? '<span class="plan-badge">Mais escolhido</span>' : ''}
            <h3>${escapeHtml(plan.name)}</h3>
            <div class="plan-price">${escapeHtml(priceText)}</div>
            <p class="plan-desc">${escapeHtml(plan.description)}</p>
          </div>
          <button type="button" class="btn ${isFeatured ? 'btn-primary' : 'btn-secondary'} t-pressable" data-plan-cta="${escapeHtml(plan.name)}">
            Escolher ${escapeHtml(plan.name)}
          </button>
        </article>
      `;
    })
    .join('');

  grid.querySelectorAll('[data-plan-cta]').forEach((btn) => {
    btn.addEventListener('click', () => openContact(btn.dataset.planCta));
  });
}

function setupModalsAndButtons() {
  document.getElementById('btn-hero-contact').addEventListener('click', () => openContact());
  document.getElementById('btn-footer-cta').addEventListener('click', () => openContact());
  document.getElementById('btn-close-contact').addEventListener('click', () => {
    closeAnimatedModal('contact-modal');
  });
  document.getElementById('contact-modal').addEventListener('click', (e) => {
    if (e.target.id === 'contact-modal') {
      closeAnimatedModal('contact-modal');
    }
  });
  document.getElementById('btn-copy-contact-msg').addEventListener('click', async () => {
    const msg = document.getElementById('contact-modal').dataset.copyText || '';
    try {
      await navigator.clipboard.writeText(msg);
      showToast('Mensagem copiada!');
    } catch {
      showToast(msg);
    }
  });
}

setupBrand();
setupCalculator();
renderShowcase();
renderPlans();
attachSpotlight('.rb-spotlight');
setupModalsAndButtons();
