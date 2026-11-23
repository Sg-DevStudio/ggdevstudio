const ROUND2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SCHEDULE_DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAY_SHORT_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAY_FULL_PT = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

const DAY_ALIASES = {
  0: ['sun', 'dom', '0'],
  1: ['mon', 'seg', '1'],
  2: ['tue', 'ter', '2'],
  3: ['wed', 'qua', '3'],
  4: ['thu', 'qui', '4'],
  5: ['fri', 'sex', '5'],
  6: ['sat', 'sab', '6'],
};

const WEEKDAY_MAP = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatBRL(value) {
  const num = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
    .format(num)
    .replace(/\u00a0/g, ' ');
}

function parseMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function formatMinutes(totalMins) {
  const safe = ((Number(totalMins) % 1440) + 1440) % 1440;
  const h = String(Math.floor(safe / 60)).padStart(2, '0');
  const m = String(safe % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function getDaySlot(schedule, dayIndex) {
  if (!schedule || typeof schedule !== 'object') return undefined;
  const keys = DAY_ALIASES[dayIndex] || [];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(schedule, key)) {
      return schedule[key];
    }
  }
  return undefined;
}

export function isBusinessOpen(businessHours, date = new Date()) {
  if (!businessHours || !businessHours.schedule) {
    return {
      isOpen: true,
      label: 'Aberto agora',
      todayWindow: '',
      detail: 'Atendimento ativo',
    };
  }

  const timeZone = businessHours.timezone || 'America/Sao_Paulo';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const dayIndex = WEEKDAY_MAP[partMap.weekday] ?? 0;
  const hour = Number(partMap.hour === '24' ? 0 : partMap.hour);
  const minute = Number(partMap.minute);
  const currentMins = hour * 60 + minute;

  const slot = getDaySlot(businessHours.schedule, dayIndex);
  const prevDayIndex = (dayIndex + 6) % 7;
  const prevSlot = getDaySlot(businessHours.schedule, prevDayIndex);

  // Check overnight spill from previous day (e.g., 18:00 - 01:00)
  if (prevSlot && prevSlot.open && prevSlot.close) {
    const pOpen = parseMinutes(prevSlot.open);
    const pClose = parseMinutes(prevSlot.close);
    if (pOpen !== null && pClose !== null && pClose < pOpen && currentMins < pClose) {
      return {
        isOpen: true,
        label: 'Aberto agora',
        todayWindow: `${prevSlot.open} às ${prevSlot.close}`,
        detail: `Fecha às ${prevSlot.close}`,
      };
    }
  }

  if (!slot || !slot.open || !slot.close) {
    return {
      isOpen: false,
      label: 'Fechado hoje',
      todayWindow: 'Fechado',
      detail: 'Consulte horários de atendimento',
    };
  }

  const openMins = parseMinutes(slot.open);
  const closeMins = parseMinutes(slot.close);
  if (openMins === null || closeMins === null) {
    return {
      isOpen: true,
      label: 'Aberto agora',
      todayWindow: `${slot.open} às ${slot.close}`,
      detail: '',
    };
  }

  const isOvernight = closeMins < openMins;
  const isOpen = isOvernight
    ? currentMins >= openMins || currentMins < closeMins
    : currentMins >= openMins && currentMins < closeMins;

  return {
    isOpen,
    label: isOpen ? 'Aberto agora' : 'Fechado agora',
    todayWindow: `${slot.open} às ${slot.close}`,
    detail: isOpen ? `Hoje até ${slot.close}` : `Abre às ${slot.open}`,
  };
}

export function formatScheduleDayWindow(slot) {
  if (!slot || !slot.open || !slot.close) return 'Fechado';
  if (slot.breakStart && slot.breakEnd) {
    return `${slot.open} às ${slot.breakStart} · ${slot.breakEnd} às ${slot.close}`;
  }
  return `${slot.open} às ${slot.close}`;
}

export function mergeSchedules(schedules = []) {
  const list = Array.isArray(schedules) ? schedules.filter((s) => s && typeof s === 'object') : [];
  const merged = {};

  for (const key of SCHEDULE_DAY_ORDER) {
    const dayIndex = DAY_KEYS.indexOf(key);
    const valid = [];

    for (const sched of list) {
      const slot = getDaySlot(sched, dayIndex);
      if (!slot || !slot.open || !slot.close) continue;
      const openMins = parseMinutes(slot.open);
      const closeMins = parseMinutes(slot.close);
      if (openMins === null || closeMins === null || closeMins <= openMins) continue;
      const bStartMins = parseMinutes(slot.breakStart);
      const bEndMins = parseMinutes(slot.breakEnd);
      valid.push({ openMins, closeMins, bStartMins, bEndMins });
    }

    if (valid.length === 0) {
      merged[key] = null;
      continue;
    }

    const minOpen = Math.min(...valid.map((v) => v.openMins));
    const maxClose = Math.max(...valid.map((v) => v.closeMins));
    const entry = {
      open: formatMinutes(minOpen),
      close: formatMinutes(maxClose),
    };

    if (valid.every((v) => v.bStartMins !== null && v.bEndMins !== null && v.bEndMins > v.bStartMins)) {
      const maxBStart = Math.max(...valid.map((v) => v.bStartMins));
      const minBEnd = Math.min(...valid.map((v) => v.bEndMins));
      if (maxBStart < minBEnd) {
        entry.breakStart = formatMinutes(maxBStart);
        entry.breakEnd = formatMinutes(minBEnd);
      }
    }

    merged[key] = entry;
  }

  return merged;
}

export function generateAvailableBookingDays(schedule, options = {}) {
  if (!schedule || typeof schedule !== 'object') return [];

  const {
    timeZone = 'America/Sao_Paulo',
    daysCount = 6,
    maxLookaheadDays = 14,
    now = new Date(),
    slotIntervalMinutes = 30,
    durationMinutes = 30,
    minLeadMinutes = 30,
  } = options;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const year = Number(partMap.year);
  const month = Number(partMap.month);
  const day = Number(partMap.day);
  const hour = Number(partMap.hour === '24' ? 0 : partMap.hour);
  const minute = Number(partMap.minute);
  const currentMins = hour * 60 + minute;
  const baseUtc = Date.UTC(year, month - 1, day, 12, 0, 0);

  const step = Math.max(15, Number(slotIntervalMinutes || 30));
  const fitMins = Math.max(15, Number(durationMinutes || step));
  const days = [];

  for (let offset = 0; offset <= maxLookaheadDays; offset += 1) {
    const d = new Date(baseUtc + offset * 86400000);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const dd = d.getUTCDate();
    const dayIndex = d.getUTCDay();
    const slot = getDaySlot(schedule, dayIndex);
    if (!slot || !slot.open || !slot.close) continue;

    const openMins = parseMinutes(slot.open);
    const closeMins = parseMinutes(slot.close);
    if (openMins === null || closeMins === null || closeMins <= openMins) continue;

    const bStart = parseMinutes(slot.breakStart);
    const bEnd = parseMinutes(slot.breakEnd);
    const hasBreak = bStart !== null && bEnd !== null && bEnd > bStart;

    const slots = [];
    for (let t = openMins; t + fitMins <= closeMins; t += step) {
      if (hasBreak && t < bEnd && t + fitMins > bStart) continue;
      if (offset === 0 && t < currentMins + minLeadMinutes) continue;
      slots.push(formatMinutes(t));
    }

    if (slots.length === 0) continue;

    const mmStr = String(m).padStart(2, '0');
    const ddStr = String(dd).padStart(2, '0');
    const dateIso = `${y}-${mmStr}-${ddStr}`;
    const ddmm = `${ddStr}/${mmStr}`;
    const weekdayShort = WEEKDAY_SHORT_PT[dayIndex];
    const weekdayFull = WEEKDAY_FULL_PT[dayIndex];
    const relativeLabel = offset === 0 ? 'Hoje' : offset === 1 ? 'Amanhã' : weekdayShort;
    const shortLabel =
      offset === 0 ? `Hoje ${ddmm}` : offset === 1 ? `Amanhã ${ddmm}` : `${weekdayShort} ${ddmm}`;

    days.push({
      dateIso,
      dayKey: DAY_KEYS[dayIndex],
      dayIndex,
      ddmm,
      weekdayShort,
      weekdayFull,
      relativeLabel,
      shortLabel,
      fullLabel: `${weekdayFull}, ${ddmm}`,
      windowLabel: formatScheduleDayWindow(slot),
      slots,
    });

    if (days.length >= daysCount) break;
  }

  return days;
}

export function calculateCartTotals(
  items = [],
  deliveryMode = 'delivery',
  neighborhoodFee = 0,
  freeDeliveryAbove = 0,
  minOrder = 0
) {
  let subtotal = 0;
  let totalQuantity = 0;

  for (const item of items) {
    const qty = Math.max(1, Number(item.quantity || 1));
    const base = Number(item.basePrice ?? item.price ?? 0);
    const addonsSum =
      item.addonsPrice !== undefined
        ? Number(item.addonsPrice || 0)
        : Array.isArray(item.addons)
          ? item.addons.reduce((acc, addon) => acc + Number(addon.price || 0), 0)
          : 0;
    subtotal += (base + addonsSum) * qty;
    totalQuantity += qty;
  }

  subtotal = ROUND2(subtotal);

  const isPickup = deliveryMode === 'pickup' || deliveryMode === 'retirada';
  const minThreshold = Math.max(0, Number(minOrder || 0));
  const freeThreshold = Math.max(0, Number(freeDeliveryAbove || 0));
  const baseFee = Math.max(0, Number(neighborhoodFee || 0));

  let deliveryFee = 0;
  if (!isPickup && totalQuantity > 0) {
    deliveryFee = freeThreshold > 0 && subtotal >= freeThreshold ? 0 : ROUND2(baseFee);
  }

  const total = ROUND2(subtotal + deliveryFee);
  const meetsMinOrder = isPickup || minThreshold <= 0 || subtotal >= minThreshold;
  const missingForMinOrder = meetsMinOrder ? 0 : ROUND2(minThreshold - subtotal);
  const missingForFreeDelivery =
    !isPickup && freeThreshold > 0 && subtotal < freeThreshold
      ? ROUND2(freeThreshold - subtotal)
      : 0;

  return {
    totalQuantity,
    subtotal,
    deliveryFee,
    total,
    meetsMinOrder,
    missingForMinOrder,
    missingForFreeDelivery,
  };
}

export function calculateCashChange(total, cashGiven) {
  const totalVal = ROUND2(Number(total || 0));
  const givenVal = ROUND2(Number(cashGiven));

  if (!Number.isFinite(givenVal) || givenVal <= 0) {
    return {
      valid: false,
      change: 0,
      error: 'Informe o valor em dinheiro para o troco.',
    };
  }
  if (givenVal < totalVal) {
    return {
      valid: false,
      change: 0,
      error: `O valor informado (${formatBRL(givenVal)}) é menor que o total (${formatBRL(totalVal)}).`,
    };
  }

  return {
    valid: true,
    change: ROUND2(givenVal - totalVal),
    error: '',
  };
}

export function buildWhatsAppUrl(phone, text = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const normalized = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  const encoded = encodeURIComponent(String(text || ''));
  return `https://wa.me/${normalized}${encoded ? `?text=${encoded}` : ''}`;
}

export function buildDeliveryWhatsAppMessage(client, order) {
  const businessName = client?.name || 'Loja';
  const items = Array.isArray(order?.items) ? order.items : [];
  const deliveryMode = order?.deliveryMode === 'pickup' ? 'pickup' : 'delivery';
  const totals =
    order?.totals ||
    calculateCartTotals(
      items,
      deliveryMode,
      order?.neighborhoodFee || 0,
      client?.freeDeliveryAbove || 0,
      client?.minOrder || 0
    );

  const lines = [];
  lines.push(`*Novo Pedido - ${businessName}*`);
  lines.push('');
  lines.push('*Itens do pedido:*');

  items.forEach((item, index) => {
    const qty = Math.max(1, Number(item.quantity || 1));
    const base = Number(item.basePrice ?? item.price ?? 0);
    const addons = Array.isArray(item.addons) ? item.addons : [];
    const addonsSum = addons.reduce((s, a) => s + Number(a.price || 0), 0);
    const lineTotal = ROUND2((base + addonsSum) * qty);
    const variantPart = item.variantName ? ` (${item.variantName})` : '';
    lines.push(`${index + 1}. ${qty}x ${item.name}${variantPart} - ${formatBRL(lineTotal)}`);
    if (addons.length > 0) {
      lines.push(`   Adicionais: ${addons.map((a) => a.name).join(', ')}`);
    }
    if (item.notes && String(item.notes).trim()) {
      lines.push(`   Obs: ${String(item.notes).trim()}`);
    }
  });

  lines.push('');
  lines.push('*Entrega / Retirada:*');
  if (deliveryMode === 'pickup') {
    lines.push('- Modalidade: Retirar no balcão');
  } else {
    lines.push('- Modalidade: Entrega');
    if (order?.neighborhoodName) {
      lines.push(`- Bairro: ${order.neighborhoodName}`);
    }
    if (order?.address) {
      lines.push(`- Endereço: ${order.address}`);
    }
    if (order?.reference) {
      lines.push(`- Complemento / Ref: ${order.reference}`);
    }
  }

  if (order?.customerName) {
    lines.push(`- Cliente: ${order.customerName}`);
  }

  lines.push('');
  lines.push('*Pagamento e Totais:*');
  const paymentMethod = order?.paymentMethod || 'Pix';
  if (paymentMethod === 'Dinheiro' && order?.cashChangeFor) {
    const changeInfo = calculateCashChange(totals.total, order.cashChangeFor);
    if (changeInfo.valid) {
      lines.push(
        `- Pagamento: Dinheiro (Troco para ${formatBRL(order.cashChangeFor)} -> Troco: ${formatBRL(changeInfo.change)})`
      );
    } else {
      lines.push(`- Pagamento: Dinheiro (Troco para ${formatBRL(order.cashChangeFor)})`);
    }
  } else {
    lines.push(`- Pagamento: ${paymentMethod}`);
  }

  lines.push(`- Subtotal: ${formatBRL(totals.subtotal)}`);
  if (deliveryMode === 'pickup') {
    lines.push('- Taxa de entrega: Grátis (retirada)');
  } else {
    lines.push(
      `- Taxa de entrega: ${totals.deliveryFee === 0 ? 'Grátis' : formatBRL(totals.deliveryFee)}`
    );
  }
  lines.push(`*Total do pedido: ${formatBRL(totals.total)}*`);

  return lines.join('\n');
}

export function buildServiceWhatsAppMessage(client, booking) {
  const businessName = client?.name || 'Estúdio';
  const services = Array.isArray(booking?.services) ? booking.services : [];
  let totalPrice = 0;
  let totalMinutes = 0;

  const lines = [];
  lines.push(`*Solicitação de Agendamento - ${businessName}*`);
  lines.push('');
  lines.push('*Serviços selecionados:*');

  services.forEach((srv, idx) => {
    const price = Number(srv.price || 0);
    const mins = Number(srv.durationMinutes || 0);
    totalPrice += price;
    totalMinutes += mins;
    lines.push(
      `${idx + 1}. ${srv.name}${mins ? ` (${mins} min)` : ''} - ${formatBRL(price)}`
    );
  });

  lines.push('');
  lines.push(`- Duração estimada: ${totalMinutes} min`);
  lines.push(`- Valor estimado: ${formatBRL(ROUND2(totalPrice))}`);
  if (booking?.professionalName) {
    lines.push(`- Profissional: ${booking.professionalName}`);
  }
  if (booking?.selectedDateLabel) {
    lines.push(`- Data: ${booking.selectedDateLabel}`);
  } else if (booking?.preferredDay) {
    lines.push(`- Dia preferido: ${booking.preferredDay}`);
  }
  if (booking?.selectedTime) {
    lines.push(`- Horário: ${booking.selectedTime}`);
  } else if (booking?.preferredPeriod) {
    lines.push(`- Período: ${booking.preferredPeriod}`);
  }
  if (booking?.customerName) {
    lines.push(`- Nome: ${booking.customerName}`);
  }
  if (booking?.customerPhone && String(booking.customerPhone).trim()) {
    lines.push(`- WhatsApp: ${String(booking.customerPhone).trim()}`);
  }
  if (booking?.reminderOptIn) {
    const hours = Number(booking.reminderHoursBefore || 2);
    lines.push(`- Lembrete automático: Sim (${hours}h antes no WhatsApp)`);
  }
  if (booking?.notes && String(booking.notes).trim()) {
    lines.push(`- Observações: ${String(booking.notes).trim()}`);
  }

  return lines.join('\n');
}

export function buildBarberReminderWhatsAppMessage(client, booking) {
  const businessName = client?.name || 'Estúdio';
  const customer = String(booking?.customerName || '').trim() || 'cliente';
  const prof = String(booking?.professionalName || '').trim();
  const withProf = prof && prof !== 'Sem preferência' ? ` com ${prof}` : '';
  const datePart = booking?.selectedDateLabel || booking?.preferredDay || 'amanhã';
  const timePart = booking?.selectedTime || booking?.preferredPeriod || 'no horário combinado';
  const services = Array.isArray(booking?.services) ? booking.services : [];
  const serviceNames = services.map((s) => s.name).filter(Boolean).join(' + ');
  const servicesSuffix = serviceNames ? ` (${serviceNames})` : '';
  return `Olá ${customer}! Lembrete automático da ${businessName}: seu horário${withProf} é em ${datePart} às ${timePart}${servicesSuffix}. Responda SIM para confirmar ou avise se precisar remarcar.`;
}

function escapeIcsText(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function formatUtcPartsIcs(date, withZ = false) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}${ss}${withZ ? 'Z' : ''}`;
}

export function buildBookingIcsFile(client, booking) {
  const dateMatch = String(booking?.dateIso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(booking?.selectedTime || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return '';

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hh = Number(timeMatch[1]);
  const mm = Number(timeMatch[2]);
  const durationMins = Math.max(15, Number(booking?.durationMinutes || 30));

  const startUtc = new Date(Date.UTC(year, month - 1, day, hh, mm, 0));
  const endUtc = new Date(startUtc.getTime() + durationMins * 60000);
  const dtStart = formatUtcPartsIcs(startUtc, false);
  const dtEnd = formatUtcPartsIcs(endUtc, false);
  const dtStamp = formatUtcPartsIcs(booking?.now instanceof Date ? booking.now : new Date(), true);

  const businessName = client?.name || 'Estúdio';
  const prof = String(booking?.professionalName || '').trim();
  const profSuffix = prof && prof !== 'Sem preferência' ? ` com ${prof}` : '';
  const servicesList = (Array.isArray(booking?.services) ? booking.services : [])
    .map((s) => s.name)
    .filter(Boolean)
    .join(' + ');
  const summary = `${businessName}${profSuffix}`;
  const descParts = [];
  if (servicesList) descParts.push(`Serviços: ${servicesList}`);
  if (booking?.customerName) descParts.push(`Cliente: ${booking.customerName}`);
  const description = descParts.join('\n') || `Agendamento em ${businessName}`;
  const location = client?.address || client?.city || '';
  const uid = `agendamento-${client?.slug || 'studio'}-${dtStart}@ggdevstudio.local`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GGDevStudio//Agendamento//PT-BR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
  ];
  if (location) {
    lines.push(`LOCATION:${escapeIcsText(location)}`);
  }
  lines.push(
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`Lembrete: ${summary}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  );
  return lines.join('\r\n');
}

export function calculateAppFeesSavings(
  monthlyRevenue,
  feePercent = 20,
  migratedPercent = 30,
  setupPrice = 397
) {
  const rev = Math.max(0, Number(monthlyRevenue || 0));
  const fee = Math.max(0, Math.min(100, Number(feePercent || 0)));
  const migrated = Math.max(0, Math.min(100, Number(migratedPercent || 0)));
  const cost = Math.max(0, Number(setupPrice || 397));

  const monthlyLoss = ROUND2(rev * (fee / 100));
  const annualLoss = ROUND2(monthlyLoss * 12);
  const monthlySaved = ROUND2(monthlyLoss * (migrated / 100));
  const annualSaved = ROUND2(monthlySaved * 12);
  const paybackDays = monthlySaved > 0 ? Math.max(1, Math.ceil((cost / monthlySaved) * 30)) : 0;

  return {
    monthlyLoss,
    annualLoss,
    monthlySaved,
    annualSaved,
    paybackDays,
  };
}
