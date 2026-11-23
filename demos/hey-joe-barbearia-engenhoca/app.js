import {
  buildBarberReminderWhatsAppMessage,
  buildBookingIcsFile,
  buildServiceWhatsAppMessage,
  buildWhatsAppUrl,
  escapeHtml,
  formatBRL,
  formatScheduleDayWindow,
  generateAvailableBookingDays,
  isBusinessOpen,
  mergeSchedules,
} from '../../shared/order-utils.mjs';

const client = JSON.parse(document.getElementById('client-data').textContent || '{}');
const agency = JSON.parse(document.getElementById('agency-data').textContent || '{}');

const DAY_LABELS = [
  { key: 'mon', label: 'Segunda-feira' },
  { key: 'tue', label: 'Terça-feira' },
  { key: 'wed', label: 'Quarta-feira' },
  { key: 'thu', label: 'Quinta-feira' },
  { key: 'fri', label: 'Sexta-feira' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

const state = {
  activeCategory: 'all',
  selectedIds: new Set(),
  selectedProfessionalId: Array.isArray(client.professionals) && client.professionals.length ? 'any' : '',
  selectedDateIso: '',
  selectedTime: '',
  preferredDay: 'Hoje',
  preferredPeriod: 'Manhã',
  customerName: '',
  customerPhone: '',
  reminderOptIn: Boolean(client.reminderAutomation?.enabled),
  notes: '',
};

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
  return String(name || 'SP')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function applyTheme() {
  const root = document.documentElement;
  root.setAttribute('data-theme', client.theme === 'dark' ? 'dark' : 'light');
  if (client.primaryColor) root.style.setProperty('--primary', client.primaryColor);
  if (client.accentColor) root.style.setProperty('--accent', client.accentColor);
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

  const monogramEl = document.getElementById('studio-monogram');
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
  document.getElementById('studio-name').textContent = client.name || 'Agendamento';
  document.getElementById('studio-tagline').textContent = client.tagline || '';

  const openInfo = isBusinessOpen(client.businessHours);
  const statusBadge = document.getElementById('status-badge');
  statusBadge.textContent = openInfo.todayWindow
    ? `${openInfo.label} · ${openInfo.todayWindow}`
    : openInfo.label;
  statusBadge.classList.toggle('is-open', openInfo.isOpen);
  statusBadge.classList.toggle('is-closed', !openInfo.isOpen);

  if (client.rating) {
    const ratingBadge = document.getElementById('rating-badge');
    ratingBadge.hidden = false;
    ratingBadge.textContent = `★ ${client.rating}`;
  }
  if (client.city) {
    const cityBadge = document.getElementById('city-badge');
    cityBadge.hidden = false;
    cityBadge.textContent = client.city;
  }

  document.getElementById('studio-address').textContent = client.address || '';
  const mapsLink = document.getElementById('btn-maps-link');
  if (client.mapsUrl) {
    mapsLink.href = client.mapsUrl;
    mapsLink.hidden = false;
  }
  const footerAgencyLink = document.getElementById('footer-agency-link');
  if (footerAgencyLink) {
    footerAgencyLink.textContent = `Feito com ${agency.brandName || 'GGDevStudio'}`;
  }
}

function getProfessionalOptions() {
  if (!Array.isArray(client.professionals) || client.professionals.length === 0) {
    return [];
  }
  return [
    ...client.professionals,
    { id: 'any', name: 'Sem preferência', role: 'Próximo horário livre' },
  ];
}

function getSelectedProfessional() {
  return getProfessionalOptions().find((p) => p.id === state.selectedProfessionalId) || null;
}

function getActiveSchedule() {
  const prof = getSelectedProfessional();
  if (prof && prof.schedule) {
    return {
      schedule: prof.schedule,
      slotIntervalMinutes: prof.slotIntervalMinutes || 30,
      label: prof.name,
    };
  }
  const profSchedules = Array.isArray(client.professionals)
    ? client.professionals.map((p) => p.schedule).filter(Boolean)
    : [];
  if (profSchedules.length > 0) {
    return {
      schedule: mergeSchedules(profSchedules),
      slotIntervalMinutes: client.slotIntervalMinutes || 30,
      label: '',
    };
  }
  return {
    schedule: client.businessHours?.schedule || null,
    slotIntervalMinutes: client.slotIntervalMinutes || 30,
    label: '',
  };
}

function getScheduleBookingContext(durationMinutes = 30) {
  const active = getActiveSchedule();
  const availableDays = active.schedule
    ? generateAvailableBookingDays(active.schedule, {
        timeZone: client.businessHours?.timezone || 'America/Sao_Paulo',
        slotIntervalMinutes: active.slotIntervalMinutes,
        durationMinutes: Math.max(30, Number(durationMinutes || 30)),
      })
    : [];
  const activeDay = availableDays.find((d) => d.dateIso === state.selectedDateIso) || availableDays[0] || null;
  const activeTime =
    activeDay && activeDay.slots.includes(state.selectedTime)
      ? state.selectedTime
      : activeDay?.slots?.[0] || '';
  state.selectedDateIso = activeDay ? activeDay.dateIso : '';
  state.selectedTime = activeTime;
  return { active, availableDays, activeDay, activeTime };
}

function renderProfessionals() {
  const section = document.getElementById('professionals-section');
  const host = document.getElementById('professionals-list');
  const options = getProfessionalOptions();
  if (!section || !host || options.length === 0) {
    if (section) section.hidden = true;
    return;
  }

  section.hidden = false;
  host.innerHTML = options
    .map((p) => {
      const selected = state.selectedProfessionalId === p.id;
      let avatarHtml;
      if (p.photo) {
        avatarHtml = `<img src="${escapeHtml(p.photo)}" alt="${escapeHtml(p.name)}" onerror="this.parentElement.textContent='${escapeHtml(getInitials(p.name))}'">`;
      } else if (p.id === 'any') {
        avatarHtml = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
      } else {
        avatarHtml = escapeHtml(getInitials(p.name));
      }

      return `
        <button
          type="button"
          class="prof-card t-pressable ${selected ? 'is-selected' : ''}"
          data-prof-id="${escapeHtml(p.id)}"
          aria-pressed="${selected ? 'true' : 'false'}"
        >
          <span class="prof-avatar">${avatarHtml}</span>
          <span class="prof-meta">
            <span class="prof-name">${escapeHtml(p.name)}</span>
            ${p.role ? `<span class="prof-role">${escapeHtml(p.role)}</span>` : ''}
            ${p.scheduleSummary ? `<span class="prof-schedule">${escapeHtml(p.scheduleSummary)}</span>` : ''}
          </span>
          <span class="prof-check" aria-hidden="true">${selected ? '✓' : ''}</span>
        </button>
      `;
    })
    .join('');

  host.querySelectorAll('.prof-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedProfessionalId = btn.dataset.profId;
      renderProfessionals();
      renderHoursCard();
      const modal = document.getElementById('booking-modal');
      if (modal && !modal.hidden) {
        renderBookingModal();
      }
    });
  });
}

function buildBookingPayload(selected = getSelectedServices(), precomputedCtx = null) {
  const mins = selected.reduce((sum, s) => sum + Number(s.durationMinutes || 0), 0);
  const ctx = precomputedCtx || getScheduleBookingContext(mins);
  const professional = getSelectedProfessional();
  const reminderEnabled = Boolean(client.reminderAutomation?.enabled);
  const hoursBefore = Number(client.reminderAutomation?.hoursBefore || 2);

  return {
    services: selected,
    durationMinutes: mins,
    professionalName: professional?.name || '',
    dateIso: ctx.activeDay?.dateIso || '',
    selectedDateLabel: ctx.activeDay?.fullLabel || '',
    selectedTime: ctx.activeTime || '',
    preferredDay: state.preferredDay,
    preferredPeriod: state.preferredPeriod,
    customerName: state.customerName.trim(),
    customerPhone: state.customerPhone.trim(),
    reminderOptIn: reminderEnabled && state.reminderOptIn,
    reminderHoursBefore: hoursBefore,
    notes: state.notes.trim(),
  };
}

function buildCurrentBookingMessage(selected = getSelectedServices(), precomputedPayload = null) {
  const payload = precomputedPayload || buildBookingPayload(selected);
  return buildServiceWhatsAppMessage(client, payload);
}

function renderCategories() {
  const host = document.getElementById('service-category-pills');
  const cats = [{ id: 'all', name: 'Todos' }, ...(client.categories || [])];
  if (cats.length <= 1) {
    host.hidden = true;
    return;
  }
  host.innerHTML = cats
    .map(
      (c) => `
      <button
        type="button"
        class="cat-pill t-pressable ${state.activeCategory === c.id ? 'active' : ''}"
        data-cat-id="${escapeHtml(c.id)}"
      >${escapeHtml(c.name)}</button>
    `
    )
    .join('');

  host.querySelectorAll('.cat-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeCategory = btn.dataset.catId;
      renderCategories();
      renderServices();
    });
  });
}

function getSelectedServices() {
  return (client.services || []).filter((s) => state.selectedIds.has(s.id));
}

function updateBookingBar(animate = false) {
  const selected = getSelectedServices();
  const bar = document.getElementById('booking-bar');
  bar.hidden = selected.length === 0;
  const total = selected.reduce((sum, s) => sum + Number(s.price || 0), 0);
  const mins = selected.reduce((sum, s) => sum + Number(s.durationMinutes || 0), 0);
  document.getElementById('booking-count').textContent = String(selected.length);
  document.getElementById('booking-summary-label').textContent =
    selected.length === 1 ? `Agendar (${mins} min)` : `Agendar ${selected.length} serviços (${mins} min)`;
  const totalEl = document.getElementById('booking-bar-total');
  const totalStr = formatBRL(total);
  if (animate && selected.length > 0) {
    animateNumber(totalEl, totalStr);
  } else {
    totalEl.textContent = totalStr;
  }
}

function renderServices(justToggledId = null) {
  const host = document.getElementById('services-list');
  const services = (client.services || []).filter(
    (s) => state.activeCategory === 'all' || s.categoryId === state.activeCategory
  );

  host.innerHTML = services
    .map((srv) => {
      const selected = state.selectedIds.has(srv.id);
      const tagsHtml = (srv.tags || [])
        .map((t) => `<span class="service-tag">${escapeHtml(t)}</span>`)
        .join('');
      const checkHtml = selected
        ? `<span class="t-success-check" data-state="${justToggledId === srv.id ? 'in' : 'in'}" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <path d="M4 9.5 7.5 13 14 5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
           </span>`
        : '+';

      return `
        <button
          type="button"
          class="service-card t-card-lift ${selected ? 'is-selected' : ''}"
          data-service-id="${escapeHtml(srv.id)}"
          aria-pressed="${selected ? 'true' : 'false'}"
        >
          <div class="service-card-main">
            <div class="service-card-top">
              <h3 class="service-card-title">${escapeHtml(srv.name)}</h3>
              ${tagsHtml}
            </div>
            ${srv.description ? `<p class="service-card-desc">${escapeHtml(srv.description)}</p>` : ''}
            <div class="service-card-meta">
              <span class="service-price">${formatBRL(srv.price)}</span>
              ${srv.durationMinutes ? `<span class="service-duration">${srv.durationMinutes} min</span>` : ''}
            </div>
          </div>
          <span class="service-check" aria-hidden="true">${checkHtml}</span>
        </button>
      `;
    })
    .join('');

  host.querySelectorAll('.service-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.serviceId;
      if (state.selectedIds.has(id)) {
        state.selectedIds.delete(id);
      } else {
        state.selectedIds.add(id);
      }
      renderServices(id);
      updateBookingBar(true);
    });
  });
}

function renderHoursCard() {
  const active = getActiveSchedule();
  const titleEl = document.getElementById('hours-section-title');
  if (titleEl) {
    titleEl.textContent = active.label
      ? `Horários de atendimento — ${active.label}`
      : 'Horários de atendimento';
  }
  const schedule = active.schedule || {};
  document.getElementById('hours-card').innerHTML = DAY_LABELS.map((d) => {
    const value = formatScheduleDayWindow(schedule[d.key]);
    return `<div class="hour-row"><span>${d.label}</span><span>${escapeHtml(value)}</span></div>`;
  }).join('');
}

function renderReviewsAndHours() {
  const reviews = client.reviews || [];
  if (reviews.length > 0) {
    document.getElementById('reviews-section').hidden = false;
    document.getElementById('reviews-list').innerHTML = reviews
      .map(
        (r) => `
        <article class="review-card">
          <div class="review-head">
            <span>${escapeHtml(r.author)}</span>
            <span class="review-stars">${'★'.repeat(Math.max(1, Math.min(5, r.stars || 5)))}</span>
          </div>
          <p class="review-text">${escapeHtml(r.text)}</p>
        </article>
      `
      )
      .join('');
  }

  renderHoursCard();
}

function renderBookingModal() {
  const selected = getSelectedServices();
  const total = selected.reduce((sum, s) => sum + Number(s.price || 0), 0);
  const mins = selected.reduce((sum, s) => sum + Number(s.durationMinutes || 0), 0);

  document.getElementById('bm-selected-services').innerHTML = selected
    .map(
      (s) => `
      <div class="selected-row">
        <span>${escapeHtml(s.name)} (${s.durationMinutes || 0} min)</span>
        <strong class="tabular">${formatBRL(s.price)}</strong>
      </div>
    `
    )
    .join('');

  document.getElementById('bm-total-duration').textContent = `${mins} min`;
  document.getElementById('bm-total-price').textContent = formatBRL(total);

  const profGroup = document.getElementById('bm-professional-group');
  const profPills = document.getElementById('bm-professional-pills');
  const profOptions = getProfessionalOptions();
  if (profGroup && profPills) {
    if (profOptions.length === 0) {
      profGroup.hidden = true;
      profPills.innerHTML = '';
    } else {
      profGroup.hidden = false;
      profPills.innerHTML = profOptions
        .map(
          (p) => `
          <button
            type="button"
            class="choice-btn bm-prof-chip ${state.selectedProfessionalId === p.id ? 'active' : ''}"
            data-prof-id="${escapeHtml(p.id)}"
          >${escapeHtml(p.name)}</button>
        `
        )
        .join('');
      profPills.querySelectorAll('.bm-prof-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.selectedProfessionalId = btn.dataset.profId;
          renderProfessionals();
          renderHoursCard();
          renderBookingModal();
        });
      });
    }
  }

  const ctx = getScheduleBookingContext(mins);
  const slotPicker = document.getElementById('bm-slot-picker');
  const legacyGroup = document.getElementById('bm-legacy-schedule');
  const dateHost = document.getElementById('bm-date-pills');
  const timeHost = document.getElementById('bm-time-slots');
  const timeHint = document.getElementById('bm-time-hint');

  if (slotPicker && legacyGroup && dateHost && timeHost) {
    if (ctx.availableDays.length > 0 && ctx.activeDay) {
      slotPicker.hidden = false;
      legacyGroup.hidden = true;

      dateHost.innerHTML = ctx.availableDays
        .map(
          (d) => `
          <button
            type="button"
            class="choice-btn date-pill ${ctx.activeDay.dateIso === d.dateIso ? 'active' : ''}"
            data-date-iso="${escapeHtml(d.dateIso)}"
          >
            <span class="date-pill-top">${escapeHtml(d.relativeLabel)}</span>
            <span class="date-pill-sub">${escapeHtml(d.ddmm)}</span>
          </button>
        `
        )
        .join('');

      dateHost.querySelectorAll('.date-pill').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.selectedDateIso = btn.dataset.dateIso;
          renderBookingModal();
        });
      });

      if (timeHint) {
        timeHint.textContent = ctx.active.label
          ? `Agenda de ${ctx.active.label} · ${ctx.activeDay.windowLabel}`
          : ctx.activeDay.windowLabel;
      }

      timeHost.innerHTML = ctx.activeDay.slots
        .map(
          (slotTime) => `
          <button
            type="button"
            class="choice-btn time-slot-btn ${ctx.activeTime === slotTime ? 'active' : ''}"
            data-time="${escapeHtml(slotTime)}"
          >${escapeHtml(slotTime)}</button>
        `
        )
        .join('');

      timeHost.querySelectorAll('.time-slot-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.selectedTime = btn.dataset.time;
          renderBookingModal();
        });
      });
    } else {
      slotPicker.hidden = true;
      legacyGroup.hidden = false;
    }
  }

  const payload = buildBookingPayload(selected, ctx);
  const reminderEnabled = Boolean(client.reminderAutomation?.enabled);
  const hoursBefore = Number(client.reminderAutomation?.hoursBefore || 2);
  const reminderGroup = document.getElementById('bm-reminder-group');
  const reminderLabel = document.getElementById('bm-reminder-label');
  const reminderOptin = document.getElementById('bm-reminder-optin');
  const reminderDetails = document.getElementById('bm-reminder-preview-details');
  const reminderPre = document.getElementById('bm-reminder-preview');

  if (reminderGroup) reminderGroup.hidden = !reminderEnabled;
  if (reminderLabel) {
    reminderLabel.textContent = `Receber lembrete automático ${hoursBefore}h antes no WhatsApp`;
  }
  if (reminderOptin) reminderOptin.checked = state.reminderOptIn;
  if (reminderDetails && reminderPre) {
    const showPreview = reminderEnabled && state.reminderOptIn;
    reminderDetails.hidden = !showPreview;
    if (showPreview) {
      reminderPre.textContent = buildBarberReminderWhatsAppMessage(client, payload);
    }
  }

  const icsBtn = document.getElementById('btn-download-ics');
  if (icsBtn) {
    icsBtn.hidden = !(ctx.activeDay && ctx.activeTime);
  }

  const msg = buildCurrentBookingMessage(selected, payload);
  document.getElementById('bm-message-preview').textContent = msg;
}

function setupControls() {
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

  document.getElementById('btn-open-booking').addEventListener('click', () => {
    renderBookingModal();
    openAnimatedModal('booking-modal');
  });

  document.querySelectorAll('#day-pills .choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.preferredDay = btn.dataset.day;
      document
        .querySelectorAll('#day-pills .choice-btn')
        .forEach((b) => b.classList.toggle('active', b === btn));
      renderBookingModal();
    });
  });

  document.querySelectorAll('#period-pills .choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.preferredPeriod = btn.dataset.period;
      document
        .querySelectorAll('#period-pills .choice-btn')
        .forEach((b) => b.classList.toggle('active', b === btn));
      renderBookingModal();
    });
  });

  const nameInput = document.getElementById('bm-customer-name');
  nameInput.addEventListener('input', (e) => {
    nameInput.classList.remove('is-error');
    state.customerName = e.target.value;
    renderBookingModal();
  });

  const phoneInput = document.getElementById('bm-customer-phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', (e) => {
      state.customerPhone = e.target.value;
      renderBookingModal();
    });
  }

  const reminderOptin = document.getElementById('bm-reminder-optin');
  if (reminderOptin) {
    reminderOptin.addEventListener('change', (e) => {
      state.reminderOptIn = e.target.checked;
      renderBookingModal();
    });
  }

  document.getElementById('bm-notes').addEventListener('input', (e) => {
    state.notes = e.target.value;
    renderBookingModal();
  });

  const downloadIcsBtn = document.getElementById('btn-download-ics');
  if (downloadIcsBtn) {
    downloadIcsBtn.addEventListener('click', () => {
      const icsContent = buildBookingIcsFile(client, buildBookingPayload());
      if (!icsContent) {
        showToast('Selecione uma data e horário válidos primeiro.');
        return;
      }
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agendamento-${client.slug || 'horario'}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Lembrete salvo! Abra o arquivo para adicionar à agenda.');
    });
  }

  document.getElementById('btn-copy-booking').addEventListener('click', async () => {
    const msg = buildCurrentBookingMessage();
    try {
      await navigator.clipboard.writeText(msg);
      showToast('Solicitação copiada!');
    } catch {
      showToast('Veja o texto pronto abaixo.');
    }
  });

  document.getElementById('btn-send-booking').addEventListener('click', async () => {
    const selected = getSelectedServices();
    if (selected.length === 0) return;
    if (!state.customerName.trim()) {
      triggerInputShake(nameInput);
      showToast('Informe seu nome para agendar.');
      nameInput.focus();
      return;
    }

    const msg = buildCurrentBookingMessage(selected);
    const targetPhone = getSelectedProfessional()?.whatsappNumber || client.whatsappNumber;
    const url = buildWhatsAppUrl(targetPhone, msg);
    if (url) {
      window.open(url, '_blank', 'noopener');
      showToast('Abrindo agendamento no WhatsApp...');
      return;
    }

    try {
      await navigator.clipboard.writeText(msg);
      showToast('Modo demonstração: mensagem copiada! Na página oficial abre direto no seu WhatsApp.');
    } catch {
      showToast('Modo demonstração: mensagem pronta abaixo.');
    }
    const details = document.querySelector('.msg-preview-details');
    if (details) details.open = true;
  });

  document.getElementById('btn-activate-preview').addEventListener('click', () => {
    const text = `Olá ${agency.ownerName || ''}! Vi a prévia de agendamento da ${client.name} e quero colocar no ar.`;
    const waUrl = buildWhatsAppUrl(agency.whatsappNumber, text);
    if (waUrl) {
      window.open(waUrl, '_blank', 'noopener');
      return;
    }
    document.getElementById('ag-subtitle').textContent =
      `Prévia exclusiva preparada pela ${agency.brandName || 'SG Digital'}. Entregamos no ar em até 48h com QR Code para o balcão.`;
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
}

applyTheme();
renderHero();
renderProfessionals();
renderCategories();
renderServices();
renderReviewsAndHours();
setupControls();
updateBookingBar(false);
