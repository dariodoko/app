const initialState = {
  user: null,
  settings: {
    clientId: "",
    calendarId: "primary",
  },
  bands: [],
  gigs: [],
  equipment: [],
};

let state = structuredClone(initialState);
let authMode = "login";
let activeGigDiaryId = null;
const GOOGLE_OAUTH_STORAGE_KEY = "glazbeni_dnevnik_google_oauth";

const elements = {
  authShell: document.getElementById("authShell"),
  appShell: document.getElementById("appShell"),
  authForm: document.getElementById("authForm"),
  authTitle: document.getElementById("authTitle"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  authSubmitButton: document.getElementById("authSubmitButton"),
  authToggleMode: document.getElementById("authToggleMode"),
  authStatus: document.getElementById("authStatus"),
  currentUserEmail: document.getElementById("currentUserEmail"),
  quickMenuToggle: document.getElementById("quickMenuToggle"),
  quickMenuPanel: document.getElementById("quickMenuPanel"),
  gigDiaryModal: document.getElementById("gigDiaryModal"),
  gigDiaryCloseButton: document.getElementById("gigDiaryCloseButton"),
  gigDiaryList: document.getElementById("gigDiaryList"),
  gigDiaryDetail: document.getElementById("gigDiaryDetail"),
  logoutButton: document.getElementById("logoutButton"),
  seedDemoButton: document.getElementById("seedDemoButton"),
  tabs: [...document.querySelectorAll(".tab-button")],
  panels: [...document.querySelectorAll(".tab-panel")],
  gigForm: document.getElementById("gigForm"),
  gigId: document.getElementById("gigId"),
  gigSubmitButton: document.getElementById("gigSubmitButton"),
  gigCancelEditButton: document.getElementById("gigCancelEditButton"),
  equipmentForm: document.getElementById("equipmentForm"),
  equipmentId: document.getElementById("equipmentId"),
  equipmentSubmitButton: document.getElementById("equipmentSubmitButton"),
  equipmentCancelEditButton: document.getElementById("equipmentCancelEditButton"),
  bandSuggestions: document.getElementById("bandSuggestions"),
  bandName: document.getElementById("bandName"),
  bandDropdown: document.getElementById("bandDropdown"),
  saveBandButton: document.getElementById("saveBandButton"),
  savedBandsList: document.getElementById("savedBandsList"),
  contractorSuggestions: document.getElementById("contractorSuggestions"),
  gigDate: document.getElementById("gigDate"),
  gigNetEarning: document.getElementById("gigNetEarning"),
  gigNetEarningHint: document.getElementById("gigNetEarningHint"),
  gigList: document.getElementById("gigList"),
  equipmentList: document.getElementById("equipmentList"),
  calendarGrid: document.getElementById("calendarGrid"),
  calendarLabel: document.getElementById("calendarLabel"),
  prevMonth: document.getElementById("prevMonth"),
  nextMonth: document.getElementById("nextMonth"),
  monthlyBreakdown: document.getElementById("monthlyBreakdown"),
  bandBreakdown: document.getElementById("bandBreakdown"),
  googleCalendarSelect: document.getElementById("googleCalendarSelect"),
  googleCalendarStatus: document.getElementById("googleCalendarStatus"),
  googleConnectButton: document.getElementById("googleConnectButton"),
  googleDisconnectButton: document.getElementById("googleDisconnectButton"),
  googleImportButton: document.getElementById("googleImportButton"),
};

const calendarState = createInitialCalendarState();
const googleCalendarRuntime = {
  accessToken: null,
  ready: true,
};

boot();

async function boot() {
  bindEvents();
  setDefaultDates();
  syncGigNetEarningAvailability();
  renderAuthMode();

  const sessionResponse = await api("/api/auth/me");
  if (sessionResponse.user) {
    await loadBootstrap();
    await finalizeGoogleRedirectSession();
  } else {
    renderAuthOnly();
  }
}

function bindEvents() {
  elements.authForm.addEventListener("submit", handleAuthSubmit);
  elements.authToggleMode.addEventListener("click", toggleAuthMode);
  elements.quickMenuToggle?.addEventListener("click", toggleQuickMenu);
  elements.gigDiaryCloseButton?.addEventListener("click", closeGigDiaryModal);
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.seedDemoButton.addEventListener("click", handleSeedDemo);

  elements.tabs.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  elements.bandName.addEventListener("focus", () => renderBandDropdown(elements.bandName.value));
  elements.bandName.addEventListener("click", () => renderBandDropdown(elements.bandName.value));
  elements.bandName.addEventListener("input", () => renderBandDropdown(elements.bandName.value));
  elements.saveBandButton.addEventListener("click", handleBandSave);
  elements.gigDate.addEventListener("input", syncGigNetEarningAvailability);

  elements.gigForm.addEventListener("submit", handleGigSubmit);
  elements.gigCancelEditButton.addEventListener("click", resetGigForm);
  elements.equipmentForm.addEventListener("submit", handleEquipmentSubmit);
  elements.equipmentCancelEditButton.addEventListener("click", resetEquipmentForm);

  elements.googleCalendarSelect.addEventListener("change", handleGoogleCalendarSelection);
  elements.googleConnectButton.addEventListener("click", handleGoogleConnect);
  elements.googleDisconnectButton.addEventListener("click", handleGoogleDisconnect);
  elements.googleImportButton.addEventListener("click", handleGoogleImport);

  elements.prevMonth.addEventListener("click", () => {
    calendarState.month -= 1;
    syncCalendarDate();
    renderCalendar();
  });

  elements.nextMonth.addEventListener("click", () => {
    calendarState.month += 1;
    syncCalendarDate();
    renderCalendar();
  });

  document.addEventListener("click", handleDocumentClick);
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const payload = {
    email: elements.authEmail.value.trim(),
    password: elements.authPassword.value,
  };

  try {
    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    await api(endpoint, {
      method: "POST",
      body: payload,
    });
    elements.authStatus.textContent = authMode === "login" ? "Prijava uspjesna." : "Racun je kreiran.";
    elements.authPassword.value = "";
    await loadBootstrap();
  } catch (error) {
    elements.authStatus.textContent = error.message;
  }
}

function toggleAuthMode() {
  authMode = authMode === "login" ? "register" : "login";
  renderAuthMode();
}

function renderAuthMode() {
  const isLogin = authMode === "login";
  elements.authTitle.textContent = isLogin ? "Prijavi se u glazbeni dnevnik" : "Kreiraj novi racun";
  elements.authSubmitButton.textContent = isLogin ? "Prijava" : "Registracija";
  elements.authToggleMode.textContent = isLogin ? "Nemam racun" : "Vec imam racun";
  elements.authStatus.textContent = isLogin ? "Prijavi se za nastavak." : "Kreiraj racun za svoj dnevnik.";
}

async function handleLogout() {
  await api("/api/auth/logout", { method: "POST" });
  state = structuredClone(initialState);
  googleCalendarRuntime.accessToken = null;
  googleCalendarRuntime.tokenClient = null;
  renderAuthOnly();
}

async function handleSeedDemo() {
  try {
    const data = await api("/api/demo/seed", { method: "POST" });
    applyBootstrapState(data);
    render();
  } catch (error) {
    setGoogleCalendarStatus(error.message);
  }
}

async function loadBootstrap() {
  const data = await api("/api/bootstrap");
  applyBootstrapState(data);
  renderApp();
}

function applyBootstrapState(data) {
  state = {
    user: data.user,
    settings: data.settings || { clientId: "", calendarId: "primary" },
    bands: Array.isArray(data.bands) ? data.bands : [],
    gigs: Array.isArray(data.gigs) ? data.gigs.map(normalizeGig) : [],
    equipment: Array.isArray(data.equipment) ? data.equipment : [],
  };
}

function renderAuthOnly() {
  elements.authShell.classList.remove("hidden");
  elements.appShell.classList.add("hidden");
  closeQuickMenu();
  closeGigDiaryModal();
}

function renderApp() {
  elements.authShell.classList.add("hidden");
  elements.appShell.classList.remove("hidden");
  closeQuickMenu();
  render();
}

function render() {
  elements.currentUserEmail.textContent = state.user?.email || "-";
  renderGoogleCalendarControls();
  renderHeroStats();
  renderSuggestions();
  renderSavedBands();
  renderGigDiary();
  renderCalendar();
  renderFinanceSummary();
  renderMonthlyBreakdown();
  renderBandBreakdown();
  renderEquipmentSummary();
  renderEquipmentList();
}

function handleDocumentClick(event) {
  const bandOption = event.target.closest("[data-band-option]");
  const deleteBandButton = event.target.closest("[data-delete-band]");
  const editBandButton = event.target.closest("[data-edit-band]");
  const quickMenuLink = event.target.closest("[data-tab-target], [data-jump-section], [data-open-diary]");
  const diaryRow = event.target.closest("[data-diary-gig]");
  const diaryEditButton = event.target.closest("[data-diary-edit]");
  const closeDiaryButton = event.target.closest("[data-close-diary]");
  const openGigButton = event.target.closest("[data-open-gig]");
  const editGigButton = event.target.closest("[data-edit-gig]");
  const deleteGigButton = event.target.closest("[data-delete-gig]");
  const editEquipmentButton = event.target.closest("[data-edit-equipment]");
  const deleteEquipmentButton = event.target.closest("[data-delete-equipment]");
  const clickedQuickMenu = event.target.closest("#quickMenuPanel, #quickMenuToggle");
  const clickedDiary = event.target.closest("#gigDiaryModal .modal-panel, #gigDiaryModal .modal-backdrop");

  if (!clickedQuickMenu) {
    closeQuickMenu();
  }

  if (closeDiaryButton) {
    closeGigDiaryModal();
    return;
  }

  if (quickMenuLink) {
    handleQuickMenuAction(quickMenuLink);
    return;
  }

  if (diaryEditButton) {
    closeGigDiaryModal();
    startGigEdit(diaryEditButton.dataset.diaryEdit);
    return;
  }

  if (diaryRow) {
    setActiveGigDiary(diaryRow.dataset.diaryGig);
    return;
  }

  if (bandOption) {
    elements.bandName.value = bandOption.dataset.bandOption;
    hideBandDropdown();
    elements.bandName.focus();
    return;
  }

  if (editBandButton) {
    handleBandRename(editBandButton.dataset.editBand);
    return;
  }

  if (deleteBandButton) {
    handleBandDelete(deleteBandButton.dataset.deleteBand);
    return;
  }

  if (openGigButton) {
    openGigFromCalendar(openGigButton.dataset.openGig);
    return;
  }

  if (editGigButton) {
    startGigEdit(editGigButton.dataset.editGig);
    return;
  }

  if (deleteGigButton) {
    handleGigDelete(deleteGigButton.dataset.deleteGig);
    return;
  }

  if (editEquipmentButton) {
    startEquipmentEdit(editEquipmentButton.dataset.editEquipment);
    return;
  }

  if (deleteEquipmentButton) {
    handleEquipmentDelete(deleteEquipmentButton.dataset.deleteEquipment);
    return;
  }

  if (!event.target.closest(".band-field")) {
    hideBandDropdown();
  }
}

async function handleGigSubmit(event) {
  event.preventDefault();
  const bandName = elements.bandName.value.trim();

  if (!isSavedBandName(bandName)) {
    window.alert("Prvo spremi bend u listu bendova pa onda spremi nastup.");
    return;
  }

  const payload = {
    bandName,
    date: elements.gigDate.value,
    time: document.getElementById("gigTime").value,
    location: document.getElementById("gigLocation").value.trim(),
    contractor: document.getElementById("contractorName").value.trim(),
    contactPhone: document.getElementById("contactPhone").value.trim(),
    contactEmail: document.getElementById("contactEmail").value.trim(),
    fee: toAmount(document.getElementById("gigFee").value),
    advance: toAmount(document.getElementById("gigAdvance").value),
    paymentMethod: document.getElementById("paymentMethod").value,
    netEarning: getGigNetEarningValue(),
    notes: document.getElementById("gigNotes").value.trim(),
  };

  try {
    if (elements.gigId.value) {
      const updated = await api(`/api/gigs/${elements.gigId.value}`, {
        method: "PUT",
        body: payload,
      });
      state.gigs = state.gigs.map((gig) => (gig.id === updated.id ? normalizeGig(updated) : gig));
    } else {
      const created = await api("/api/gigs", {
        method: "POST",
        body: payload,
      });
      state.gigs.unshift(normalizeGig(created));
    }

    await refreshBands();
    resetGigForm();
    render();
  } catch (error) {
    window.alert(error.message);
  }
}

async function handleBandSave() {
  const bandName = elements.bandName.value.trim();
  if (!bandName) {
    window.alert("Unesi naziv benda prije spremanja.");
    elements.bandName.focus();
    return;
  }

  try {
    await api("/api/bands", {
      method: "POST",
      body: { name: bandName },
    });
    await refreshBands();
    renderSuggestions();
    renderSavedBands();
    renderBandDropdown(bandName);
  } catch (error) {
    window.alert(error.message);
  }
}

function startGigEdit(gigId) {
  const gig = state.gigs.find((item) => item.id === gigId);
  if (!gig) {
    return;
  }

  elements.gigId.value = gig.id;
  elements.bandName.value = gig.bandName;
  elements.gigDate.value = gig.date;
  document.getElementById("gigTime").value = gig.time || "";
  document.getElementById("gigLocation").value = gig.location;
  document.getElementById("contractorName").value = gig.contractor;
  document.getElementById("contactPhone").value = gig.contactPhone || "";
  document.getElementById("contactEmail").value = gig.contactEmail || "";
  document.getElementById("gigFee").value = gig.fee;
  document.getElementById("gigAdvance").value = gig.advance;
  document.getElementById("paymentMethod").value = gig.paymentMethod;
  document.getElementById("gigNotes").value = gig.notes || "";
  syncGigNetEarningAvailability();
  elements.gigNetEarning.value = gig.netEarning == null ? "" : gig.netEarning;
  elements.gigSubmitButton.textContent = "Spremi izmjene";
  elements.gigCancelEditButton.classList.remove("hidden");
  elements.gigForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetGigForm() {
  elements.gigForm.reset();
  elements.gigId.value = "";
  setDefaultDates();
  syncGigNetEarningAvailability();
  elements.gigSubmitButton.textContent = "Spremi nastup";
  elements.gigCancelEditButton.classList.add("hidden");
  hideBandDropdown();
}

async function handleGigDelete(gigId) {
  await api(`/api/gigs/${gigId}`, { method: "DELETE" });
  state.gigs = state.gigs.filter((gig) => gig.id !== gigId);
  render();
}

async function handleEquipmentSubmit(event) {
  event.preventDefault();

  const payload = {
    date: document.getElementById("equipmentDate").value,
    type: document.getElementById("equipmentType").value,
    name: document.getElementById("equipmentName").value.trim(),
    price: toAmount(document.getElementById("equipmentPrice").value),
    notes: document.getElementById("equipmentNotes").value.trim(),
  };

  try {
    if (elements.equipmentId.value) {
      const updated = await api(`/api/equipment/${elements.equipmentId.value}`, {
        method: "PUT",
        body: payload,
      });
      state.equipment = state.equipment.map((item) => (item.id === updated.id ? updated : item));
    } else {
      const created = await api("/api/equipment", {
        method: "POST",
        body: payload,
      });
      state.equipment.unshift(created);
    }

    resetEquipmentForm();
    render();
  } catch (error) {
    window.alert(error.message);
  }
}

function startEquipmentEdit(equipmentId) {
  const item = state.equipment.find((entry) => entry.id === equipmentId);
  if (!item) {
    return;
  }

  elements.equipmentId.value = item.id;
  document.getElementById("equipmentDate").value = item.date;
  document.getElementById("equipmentType").value = item.type;
  document.getElementById("equipmentName").value = item.name;
  document.getElementById("equipmentPrice").value = item.price;
  document.getElementById("equipmentNotes").value = item.notes || "";
  elements.equipmentSubmitButton.textContent = "Spremi izmjene";
  elements.equipmentCancelEditButton.classList.remove("hidden");
  elements.equipmentForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetEquipmentForm() {
  elements.equipmentForm.reset();
  elements.equipmentId.value = "";
  setDefaultDates();
  elements.equipmentSubmitButton.textContent = "Spremi opremu";
  elements.equipmentCancelEditButton.classList.add("hidden");
}

async function handleEquipmentDelete(equipmentId) {
  await api(`/api/equipment/${equipmentId}`, { method: "DELETE" });
  state.equipment = state.equipment.filter((item) => item.id !== equipmentId);
  render();
}

function renderHeroStats() {
  const totalRevenue = sum(state.gigs.map((gig) => gig.netEarning || 0));
  const equipmentNet = calculateEquipmentNet();

  document.getElementById("heroGigCount").textContent = String(state.gigs.length);
  document.getElementById("heroRevenue").textContent = formatCurrency(totalRevenue);
  document.getElementById("heroEquipment").textContent = formatCurrency(equipmentNet);
}

function renderSuggestions() {
  const bandNames = state.bands.map((band) => band.name);
  const contractors = [...new Set(state.gigs.map((gig) => gig.contractor).filter(Boolean))].sort(localeSort);

  elements.bandSuggestions.innerHTML = bandNames.map((band) => `<option value="${escapeHtml(band)}"></option>`).join("");
  elements.contractorSuggestions.innerHTML = contractors.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
}

function renderBandDropdown(query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase("hr");
  const matches = state.bands
    .map((band) => band.name)
    .filter((band) => !normalizedQuery || band.toLocaleLowerCase("hr").includes(normalizedQuery));

  if (!matches.length) {
    hideBandDropdown();
    return;
  }

  elements.bandDropdown.innerHTML = matches
    .map((band) => `<button type="button" class="autocomplete-option" data-band-option="${escapeHtml(band)}">${escapeHtml(band)}</button>`)
    .join("");
  elements.bandDropdown.classList.remove("hidden");
}

function hideBandDropdown() {
  elements.bandDropdown.classList.add("hidden");
  elements.bandDropdown.innerHTML = "";
}

function isSavedBandName(name) {
  const normalized = name.trim().toLocaleLowerCase("hr");
  return Boolean(normalized) && state.bands.some((band) => band.name.trim().toLocaleLowerCase("hr") === normalized);
}

function renderSavedBands() {
  if (!state.bands.length) {
    elements.savedBandsList.className = "saved-bands-list empty-state";
    elements.savedBandsList.textContent = "Jos nema spremljenih bendova.";
    return;
  }

  elements.savedBandsList.className = "saved-bands-list";
  elements.savedBandsList.innerHTML = state.bands.map((band) => `
    <article class="saved-band-item">
      <div>
        <strong>${escapeHtml(band.name)}</strong>
      </div>
      <div class="saved-band-actions">
        <button type="button" class="ghost-button small-button" data-edit-band="${band.id}">Uredi</button>
        <button type="button" class="danger-button small-button" data-delete-band="${band.id}">Obrisi</button>
      </div>
    </article>
  `).join("");
}

async function handleBandRename(bandId) {
  const band = state.bands.find((item) => item.id === bandId);
  if (!band) {
    return;
  }

  const nextBandRaw = window.prompt("Novo ime benda:", band.name);
  if (nextBandRaw === null) {
    return;
  }

  const nextBand = nextBandRaw.trim();
  if (!nextBand || nextBand === band.name) {
    return;
  }

  await api(`/api/bands/${bandId}`, {
    method: "PUT",
    body: { name: nextBand },
  });
  await loadBootstrap();
}

async function handleBandDelete(bandId) {
  await api(`/api/bands/${bandId}`, { method: "DELETE" });
  state.bands = state.bands.filter((band) => band.id !== bandId);
  render();
}

function createGigCard(gig) {
  const paymentClass = gig.paymentMethod === "Gotovina" ? "cash" : "bank";
  const isImportedFromGoogle = gig.source === "google-import";

  return `
    <article class="entry-card" id="gig-card-${gig.id}" data-gig-card="${gig.id}">
      <div class="entry-header">
        <div>
          <h3>${escapeHtml(gig.bandName)}</h3>
          <p class="meta">${formatFullDate(gig.date)}${gig.time ? ` u ${gig.time}` : ""} - ${escapeHtml(gig.location)}</p>
          <p class="meta">Ugovaratelj: ${escapeHtml(gig.contractor)}</p>
          ${gig.contactPhone ? `<p class="meta meta-contact"><span class="meta-icon" aria-hidden="true">☎</span><span>Kontakt telefon: <a class="meta-link" href="${escapeAttribute(buildTelHref(gig.contactPhone))}">${escapeHtml(gig.contactPhone)}</a></span></p>` : ""}
          ${gig.contactEmail ? `<p class="meta meta-contact"><span class="meta-icon" aria-hidden="true">✉</span><span>Kontakt email: <a class="meta-link" href="${escapeAttribute(buildMailtoHref(gig.contactEmail))}">${escapeHtml(gig.contactEmail)}</a></span></p>` : ""}
        </div>
        <span class="pill ${paymentClass}">${isImportedFromGoogle ? "Google import" : gig.paymentMethod}</span>
      </div>
      <div class="detail-grid">
        <div class="detail-item">
          <span>Dogovorena cijena</span>
          <strong>${formatCurrency(gig.fee)}</strong>
        </div>
        <div class="detail-item">
          <span>Avans</span>
          <strong>${formatCurrency(gig.advance)}</strong>
        </div>
        <div class="detail-item">
          <span>Tocna zarada</span>
          <strong>${gig.netEarning == null ? "Ceka unos" : formatCurrency(gig.netEarning)}</strong>
        </div>
        <div class="detail-item">
          <span>Preostalo za naplatu</span>
          <strong>${formatCurrency(Math.max(gig.fee - gig.advance, 0))}</strong>
        </div>
      </div>
      ${gig.notes ? `<p class="meta">${escapeHtml(gig.notes)}</p>` : ""}
      ${isImportedFromGoogle ? `<p class="meta synced-note">Uvezeno iz Google Kalendara kao lokalna kopija. Promjene u aplikaciji ne mijenjaju Google event.</p>` : ""}
      <div class="card-actions">
        <button class="ghost-button small-button" data-edit-gig="${gig.id}" type="button">Uredi</button>
        <button class="danger-button small-button" data-delete-gig="${gig.id}" type="button">Obrisi</button>
      </div>
    </article>
  `;
}

function renderCalendar() {
  const current = new Date(calendarState.year, calendarState.month, 1);
  elements.calendarLabel.textContent = capitalize(current.toLocaleDateString("hr-HR", { month: "long", year: "numeric" }));

  const firstDay = new Date(calendarState.year, calendarState.month, 1);
  const lastDay = new Date(calendarState.year, calendarState.month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalSlots = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const todayKey = getDateKey(new Date());
  const html = [];

  for (let slot = 0; slot < totalSlots; slot += 1) {
    const dayNumber = slot - startOffset + 1;
    const date = new Date(calendarState.year, calendarState.month, dayNumber);
    const dateKey = getDateKey(date);
    const dayGigs = state.gigs.filter((gig) => gig.date === dateKey);
    const classes = [
      "calendar-day",
      date.getMonth() !== calendarState.month ? "muted" : "",
      dateKey === todayKey ? "today" : "",
      dayGigs.length ? "occupied" : "",
    ].filter(Boolean).join(" ");
    const firstGigId = dayGigs[0]?.id || "";

    html.push(`
      <article class="${classes}" ${firstGigId ? `data-open-gig="${firstGigId}"` : ""}>
        <strong>${date.getDate()}</strong>
        ${dayGigs.length ? `<span class="calendar-day-dot" aria-hidden="true"></span>` : ""}
      </article>
    `);
  }

  elements.calendarGrid.innerHTML = html.join("");
}

function openGigFromCalendar(gigId) {
  switchTab("nastupi");
  openGigDiaryModal(gigId);
}

function renderFinanceSummary() {
  const now = new Date();
  const currentWeek = getWeekNumber(now);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const completedGigs = state.gigs.filter((gig) => gig.netEarning != null);
  const totalRevenue = sum(completedGigs.map((gig) => gig.netEarning));
  const cashRevenue = sum(completedGigs.filter((gig) => gig.paymentMethod === "Gotovina").map((gig) => gig.netEarning));
  const bankRevenue = sum(completedGigs.filter((gig) => gig.paymentMethod === "Racun").map((gig) => gig.netEarning));
  const totalAdvance = sum(state.gigs.map((gig) => gig.advance));
  const averageRevenue = completedGigs.length ? totalRevenue / completedGigs.length : 0;

  const weeklyRevenue = sum(completedGigs.filter((gig) => {
    const date = parseLocalDate(gig.date);
    return date.getFullYear() === currentYear && getWeekNumber(date) === currentWeek;
  }).map((gig) => gig.netEarning));

  const monthlyRevenue = sum(completedGigs.filter((gig) => {
    const date = parseLocalDate(gig.date);
    return date.getFullYear() === currentYear && date.getMonth() === currentMonth;
  }).map((gig) => gig.netEarning));

  const yearlyRevenue = sum(completedGigs.filter((gig) => parseLocalDate(gig.date).getFullYear() === currentYear).map((gig) => gig.netEarning));

  document.getElementById("weeklyRevenue").textContent = formatCurrency(weeklyRevenue);
  document.getElementById("monthlyRevenue").textContent = formatCurrency(monthlyRevenue);
  document.getElementById("yearlyRevenue").textContent = formatCurrency(yearlyRevenue);
  document.getElementById("totalRevenue").textContent = formatCurrency(totalRevenue);
  document.getElementById("cashRevenue").textContent = formatCurrency(cashRevenue);
  document.getElementById("bankRevenue").textContent = formatCurrency(bankRevenue);
  document.getElementById("totalAdvance").textContent = formatCurrency(totalAdvance);
  document.getElementById("averageRevenue").textContent = formatCurrency(averageRevenue);
}

function renderMonthlyBreakdown() {
  if (!state.gigs.length) {
    elements.monthlyBreakdown.className = "breakdown-table empty-state";
    elements.monthlyBreakdown.textContent = "Financijski pregled ce se pojaviti nakon prvog upisa nastupa.";
    return;
  }

  const months = new Map();
  state.gigs.forEach((gig) => {
    const date = parseLocalDate(gig.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!months.has(key)) {
      months.set(key, {
        label: capitalize(date.toLocaleDateString("hr-HR", { month: "long", year: "numeric" })),
        gigs: 0,
        revenue: 0,
        completedGigs: 0,
        advances: 0,
      });
    }

    const month = months.get(key);
    month.gigs += 1;
    month.advances += gig.advance;
    if (gig.netEarning != null) {
      month.revenue += gig.netEarning;
      month.completedGigs += 1;
    }
  });

  elements.monthlyBreakdown.className = "breakdown-table";
  elements.monthlyBreakdown.innerHTML = `
    <div class="breakdown-row header">
      <span>Mjesec</span>
      <span>Nastupi</span>
      <span>Avansi</span>
      <span>Zarada</span>
    </div>
    ${[...months.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([, month]) => `
      <div class="breakdown-row">
        <strong>${month.label}</strong>
        <span>${month.gigs} nastupa</span>
        <span>${formatCurrency(month.advances)} avansa</span>
        <span>${formatCurrency(month.revenue)} zarade (${month.completedGigs})</span>
      </div>
    `).join("")}
  `;
}

function renderBandBreakdown() {
  if (!state.gigs.length) {
    elements.bandBreakdown.className = "breakdown-table empty-state";
    elements.bandBreakdown.textContent = "Pregled po bendovima ce se pojaviti nakon prvog upisa nastupa.";
    return;
  }

  const bands = new Map();
  state.gigs.forEach((gig) => {
    const key = gig.bandName || "Bez benda";
    if (!bands.has(key)) {
      bands.set(key, {
        label: key,
        gigs: 0,
        revenue: 0,
        completedGigs: 0,
      });
    }

    const band = bands.get(key);
    band.gigs += 1;
    if (gig.netEarning != null) {
      band.revenue += gig.netEarning;
      band.completedGigs += 1;
    }
  });

  elements.bandBreakdown.className = "breakdown-table";
  elements.bandBreakdown.innerHTML = `
    <div class="breakdown-row header">
      <span>Bend</span>
      <span>Svirke</span>
      <span>Unesene zarade</span>
      <span>Ukupna zarada</span>
    </div>
    ${[...bands.values()].sort((a, b) => a.label.localeCompare(b.label, "hr")).map((band) => `
      <div class="breakdown-row">
        <strong>${escapeHtml(band.label)}</strong>
        <span>${band.gigs} svirki</span>
        <span>${band.completedGigs} unosa</span>
        <span>${formatCurrency(band.revenue)}</span>
      </div>
    `).join("")}
  `;
}

function renderEquipmentSummary() {
  const bought = sum(state.equipment.filter((item) => item.type === "Kupljeno").map((item) => item.price));
  const sold = sum(state.equipment.filter((item) => item.type === "Prodano").map((item) => item.price));
  document.getElementById("equipmentBought").textContent = formatCurrency(bought);
  document.getElementById("equipmentSold").textContent = formatCurrency(sold);
  document.getElementById("equipmentNet").textContent = formatCurrency(sold - bought);
}

function renderEquipmentList() {
  if (!state.equipment.length) {
    elements.equipmentList.className = "card-list empty-state";
    elements.equipmentList.textContent = "Jos nema unosa opreme.";
    return;
  }

  elements.equipmentList.className = "card-list";
  elements.equipmentList.innerHTML = state.equipment.map((item) => `
    <article class="entry-card">
      <div class="entry-header">
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p class="meta">${formatFullDate(item.date)}</p>
        </div>
        <span class="pill ${item.type === "Prodano" ? "sold" : "bought"}">${item.type}</span>
      </div>
      <div class="detail-grid">
        <div class="detail-item">
          <span>Cijena</span>
          <strong>${formatCurrency(item.price)}</strong>
        </div>
      </div>
      ${item.notes ? `<p class="meta">${escapeHtml(item.notes)}</p>` : ""}
      <div class="card-actions">
        <button class="ghost-button small-button" data-edit-equipment="${item.id}" type="button">Uredi</button>
        <button class="danger-button small-button" data-delete-equipment="${item.id}" type="button">Obrisi</button>
      </div>
    </article>
  `).join("");
}

function renderGoogleCalendarControls() {
  elements.googleCalendarSelect.value = state.settings.calendarId || "primary";
  elements.googleDisconnectButton.disabled = !googleCalendarRuntime.accessToken;
  elements.googleImportButton.disabled = !googleCalendarRuntime.accessToken;

  if (!googleCalendarRuntime.ready) {
    setGoogleCalendarStatus("Google Identity library se ucitava...");
  } else if (!state.settings.clientId) {
    setGoogleCalendarStatus("Administrator jos nije postavio zajednicki Google OAuth Client ID na serveru.");
  } else if (googleCalendarRuntime.accessToken) {
    setGoogleCalendarStatus("Google Calendar je povezan i spreman za read-only uvoz nastupa.");
  } else {
    setGoogleCalendarStatus("Google Calendar nije povezan.");
  }
}

async function handleGoogleCalendarSelection() {
  state.settings.calendarId = elements.googleCalendarSelect.value;
  await saveSettings();
  render();
}

async function saveSettings() {
  state.settings = await api("/api/settings", {
    method: "PUT",
    body: state.settings,
  });
}

async function handleGoogleConnect() {
  try {
    assertGoogleCalendarReady();
    setGoogleCalendarStatus("Preusmjeravam na Google prijavu...");
    startGoogleAuthRedirect("connect");
  } catch (error) {
    setGoogleCalendarStatus(error.message);
  }
}

function handleGoogleDisconnect() {
  googleCalendarRuntime.accessToken = null;
  clearGoogleOAuthSession();
  elements.googleCalendarSelect.innerHTML = `<option value="primary">Primary calendar</option>`;
  renderGoogleCalendarControls();
}

async function handleGoogleImport() {
  try {
    assertGoogleCalendarReady();
    if (!googleCalendarRuntime.accessToken) {
      setGoogleCalendarStatus("Preusmjeravam na Google prijavu za uvoz nastupa...");
      startGoogleAuthRedirect("import");
      return;
    }
    await importGoogleEventsIntoApp();
  } catch (error) {
    setGoogleCalendarStatus(error.message);
  }
}

async function loadGoogleCalendars() {
  const response = await fetchWithTimeout("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: {
      Authorization: `Bearer ${googleCalendarRuntime.accessToken}`,
    },
  }, 15000, "Dohvat Google kalendara traje predugo.");
  if (!response.ok) {
    throw new Error("Ne mogu dohvatiti listu Google kalendara.");
  }

  const data = await response.json();
  const calendars = Array.isArray(data.items) ? data.items : [];
  elements.googleCalendarSelect.innerHTML = calendars.map((calendar) => (
    `<option value="${escapeHtml(calendar.id)}">${escapeHtml(calendar.summary)}</option>`
  )).join("");

  if (!calendars.some((calendar) => calendar.id === state.settings.calendarId) && calendars[0]) {
    state.settings.calendarId = calendars[0].id;
    await saveSettings();
  }
  elements.googleCalendarSelect.value = state.settings.calendarId;
}

function assertGoogleCalendarReady() {
  if (!googleCalendarRuntime.ready) {
    throw new Error("Google Identity library jos nije spremna.");
  }
  if (!state.settings.clientId) {
    throw new Error("Google OAuth Client ID mora biti postavljen na serveru.");
  }
  if (!isHttpOrigin()) {
    throw new Error("Google Calendar povezivanje radi preko http://localhost ili https domene.");
  }
}

function startGoogleAuthRedirect(action) {
  const oauthState = crypto.randomUUID();
  sessionStorage.setItem(GOOGLE_OAUTH_STORAGE_KEY, JSON.stringify({
    state: oauthState,
    action,
  }));

  const redirectUri = `${window.location.origin}/`;
  const query = new URLSearchParams({
    client_id: state.settings.clientId,
    redirect_uri: redirectUri,
    response_type: "token",
    scope: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    include_granted_scopes: "true",
    prompt: "consent",
    state: oauthState,
  });

  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`);
}

async function finalizeGoogleRedirectSession() {
  if (!window.location.hash) {
    return;
  }

  const hash = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = hash.get("access_token");
  const returnedState = hash.get("state");
  const oauthError = hash.get("error");
  const errorDescription = hash.get("error_description");
  const pendingRaw = sessionStorage.getItem(GOOGLE_OAUTH_STORAGE_KEY);
  const pending = pendingRaw ? safeJsonParse(pendingRaw) : null;

  if (!accessToken && !oauthError) {
    return;
  }

  history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  clearGoogleOAuthSession();

  if (!pending?.state || pending.state !== returnedState) {
    setGoogleCalendarStatus("Google prijava nije valjano vracena u aplikaciju.");
    return;
  }

  if (oauthError) {
    setGoogleCalendarStatus(`Google autorizacija nije uspjela: ${errorDescription || oauthError}`);
    return;
  }

  if (!accessToken) {
    setGoogleCalendarStatus("Google nije vratio pristupni token.");
    return;
  }

  googleCalendarRuntime.accessToken = accessToken;
  try {
    setGoogleCalendarStatus("Google prijava je prosla. Ucitavam tvoje kalendare...");
    await loadGoogleCalendars();
    renderGoogleCalendarControls();

    if (pending.action === "import") {
      await importGoogleEventsIntoApp();
    }
  } catch (error) {
    setGoogleCalendarStatus(error.message);
  }
}

function clearGoogleOAuthSession() {
  sessionStorage.removeItem(GOOGLE_OAUTH_STORAGE_KEY);
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function importGoogleEventsIntoApp() {
  await loadGoogleCalendars();
  const importedEvents = await importGoogleCalendarEvents();
  const result = await api("/api/google-calendar/import", {
    method: "POST",
    body: { gigs: importedEvents },
  });
  state.gigs = Array.isArray(result.gigs) ? result.gigs.map(normalizeGig) : state.gigs;
  setGoogleCalendarStatus(`Uvezeno ${result.importedCount || importedEvents.length} nastupa iz Google Kalendara.`);
  render();
}

async function importGoogleCalendarEvents() {
  const calendarId = encodeURIComponent(state.settings.calendarId || "primary");
  const imported = [];
  let pageToken = "";

  do {
    const query = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
    });

    if (pageToken) {
      query.set("pageToken", pageToken);
    }

    const response = await fetchWithTimeout(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${googleCalendarRuntime.accessToken}`,
      },
    }, 20000, "Dohvat Google nastupa traje predugo.");

    if (!response.ok) {
      throw new Error("Ne mogu dohvatiti nastupe iz Google Kalendara.");
    }

    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    imported.push(...items
      .filter((item) => item.status !== "cancelled" && (item.start?.dateTime || item.start?.date))
      .map(mapGoogleEventToGigPayload));

    pageToken = data.nextPageToken || "";
  } while (pageToken);

  if (!imported.length) {
    throw new Error("Na odabranom Google kalendaru nema nastupa za uvoz.");
  }

  return imported;
}

async function fetchWithTimeout(url, options, timeoutMs, timeoutMessage) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function mapGoogleEventToGigPayload(event) {
  const startDateTime = event.start?.dateTime || "";
  const startDate = event.start?.date || "";

  return {
    bandName: event.summary?.trim() || "Google Calendar",
    date: startDate || startDateTime.slice(0, 10),
    time: startDateTime ? formatTimeFromDateTime(startDateTime) : "",
    location: event.location?.trim() || "Lokacija nije upisana",
    contractor: event.organizer?.displayName || event.organizer?.email || "Google Calendar",
    contactPhone: extractPhoneNumber(event.description || ""),
    contactEmail: event.organizer?.email || extractEmailAddress(event.description || ""),
    notes: [
      "Uvezeno iz Google Kalendara. Originalni event ureduje se samo u Google Kalendaru.",
      event.description?.trim() || "",
    ].filter(Boolean).join("\n\n"),
    googleCalendar: {
      eventId: event.id,
      calendarId: state.settings.calendarId || "primary",
    },
  };
}

function setGoogleCalendarStatus(message) {
  elements.googleCalendarStatus.textContent = message;
}

async function refreshBands() {
  state.bands = await api("/api/bands");
}

function switchTab(tabId) {
  elements.tabs.forEach((button) => button.classList.toggle("active", button.dataset.tab === tabId));
  elements.panels.forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
  closeQuickMenu();
}

function toggleQuickMenu() {
  elements.quickMenuPanel?.classList.toggle("hidden");
  elements.quickMenuToggle?.classList.toggle("is-active", !elements.quickMenuPanel?.classList.contains("hidden"));
}

function closeQuickMenu() {
  elements.quickMenuPanel?.classList.add("hidden");
  elements.quickMenuToggle?.classList.remove("is-active");
}

function handleQuickMenuAction(button) {
  const tabTarget = button.dataset.tabTarget;
  const jumpSection = button.dataset.jumpSection;
  const shouldOpenDiary = button.dataset.openDiary === "true";

  if (shouldOpenDiary) {
    switchTab("nastupi");
    openGigDiaryModal();
    closeQuickMenu();
    return;
  }

  if (tabTarget) {
    switchTab(tabTarget);
  }

  if (jumpSection) {
    requestAnimationFrame(() => {
      const target = document.getElementById(jumpSection);
      if (!target) {
        return;
      }
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  closeQuickMenu();
}

function renderGigDiary() {
  if (!state.gigs.length) {
    activeGigDiaryId = null;
    elements.gigDiaryList.className = "diary-list empty-state";
    elements.gigDiaryList.textContent = "Jos nema upisanih nastupa.";
    elements.gigDiaryDetail.className = "diary-detail empty-state";
    elements.gigDiaryDetail.textContent = "Odaberi nastup za detalje.";
    return;
  }

  const hasActiveGig = state.gigs.some((gig) => gig.id === activeGigDiaryId);
  if (!hasActiveGig) {
    activeGigDiaryId = state.gigs[0].id;
  }

  elements.gigDiaryList.className = "diary-list";
  elements.gigDiaryList.innerHTML = state.gigs.map((gig) => `
    <button type="button" class="diary-list-item ${gig.id === activeGigDiaryId ? "active" : ""}" data-diary-gig="${gig.id}">
      <strong>${escapeHtml(gig.bandName)}</strong>
      <span>${formatFullDate(gig.date)}${gig.time ? ` u ${gig.time}` : ""}</span>
      <span>${escapeHtml(gig.location)}</span>
    </button>
  `).join("");

  const activeGig = state.gigs.find((gig) => gig.id === activeGigDiaryId);
  if (!activeGig) {
    elements.gigDiaryDetail.className = "diary-detail empty-state";
    elements.gigDiaryDetail.textContent = "Odaberi nastup za detalje.";
    return;
  }

  const paymentClass = activeGig.paymentMethod === "Gotovina" ? "cash" : "bank";
  const isImportedFromGoogle = activeGig.source === "google-import";
  elements.gigDiaryDetail.className = "diary-detail";
  elements.gigDiaryDetail.innerHTML = `
    <article class="entry-card entry-card-active">
      <div class="diary-detail-top">
        <span class="pill ${paymentClass}">${isImportedFromGoogle ? "Google import" : activeGig.paymentMethod}</span>
        <button type="button" class="primary-button small-button" data-diary-edit="${activeGig.id}">Uredi nastup</button>
      </div>
      <div class="entry-header">
        <div>
          <h3>${escapeHtml(activeGig.bandName)}</h3>
          <p class="meta">${formatFullDate(activeGig.date)}${activeGig.time ? ` u ${activeGig.time}` : ""} - ${escapeHtml(activeGig.location)}</p>
          <p class="meta">Ugovaratelj: ${escapeHtml(activeGig.contractor)}</p>
          ${activeGig.contactPhone ? `<p class="meta meta-contact"><span class="meta-icon" aria-hidden="true">☎</span><span>Kontakt telefon: <a class="meta-link" href="${escapeAttribute(buildTelHref(activeGig.contactPhone))}">${escapeHtml(activeGig.contactPhone)}</a></span></p>` : ""}
          ${activeGig.contactEmail ? `<p class="meta meta-contact"><span class="meta-icon" aria-hidden="true">✉</span><span>Kontakt email: <a class="meta-link" href="${escapeAttribute(buildMailtoHref(activeGig.contactEmail))}">${escapeHtml(activeGig.contactEmail)}</a></span></p>` : ""}
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail-item">
          <span>Dogovorena cijena</span>
          <strong>${formatCurrency(activeGig.fee)}</strong>
        </div>
        <div class="detail-item">
          <span>Avans</span>
          <strong>${formatCurrency(activeGig.advance)}</strong>
        </div>
        <div class="detail-item">
          <span>Tocna zarada</span>
          <strong>${activeGig.netEarning == null ? "Ceka unos" : formatCurrency(activeGig.netEarning)}</strong>
        </div>
        <div class="detail-item">
          <span>Preostalo za naplatu</span>
          <strong>${formatCurrency(Math.max(activeGig.fee - activeGig.advance, 0))}</strong>
        </div>
      </div>
      ${activeGig.notes ? `<p class="meta">${escapeHtml(activeGig.notes)}</p>` : ""}
      ${isImportedFromGoogle ? `<p class="meta synced-note">Ovaj nastup je uvezen iz Google Kalendara kao lokalna kopija.</p>` : ""}
    </article>
  `;
}

function openGigDiaryModal(gigId = null) {
  if (gigId) {
    activeGigDiaryId = gigId;
  }

  renderGigDiary();
  elements.gigDiaryModal?.classList.remove("hidden");
  elements.gigDiaryModal?.setAttribute("aria-hidden", "false");
}

function closeGigDiaryModal() {
  elements.gigDiaryModal?.classList.add("hidden");
  elements.gigDiaryModal?.setAttribute("aria-hidden", "true");
}

function setActiveGigDiary(gigId) {
  activeGigDiaryId = gigId;
  renderGigDiary();
}

function setDefaultDates() {
  const today = getDateKey(new Date());
  elements.gigDate.value ||= today;
  document.getElementById("equipmentDate").value ||= today;
}

function syncGigNetEarningAvailability() {
  const isAllowed = isPastDate(elements.gigDate.value);
  elements.gigNetEarning.disabled = !isAllowed;
  elements.gigNetEarning.required = isAllowed;

  if (!isAllowed) {
    elements.gigNetEarning.value = "";
    elements.gigNetEarning.placeholder = "Unos nakon nastupa";
    elements.gigNetEarningHint.textContent = "Tocna zarada moze se unijeti tek nakon sto datum nastupa prodje.";
  } else {
    elements.gigNetEarning.placeholder = "0.00";
    elements.gigNetEarningHint.textContent = "Nastup je prosao pa sada mozes unijeti tocnu zaradu.";
  }
}

function getGigNetEarningValue() {
  if (!isPastDate(elements.gigDate.value)) {
    return null;
  }
  const rawValue = elements.gigNetEarning.value.trim();
  return rawValue ? toAmount(rawValue) : null;
}

function normalizeGig(gig) {
  return {
    ...gig,
    netEarning: Number.isFinite(gig.netEarning) ? gig.netEarning : null,
    contactPhone: gig.contactPhone || "",
    contactEmail: gig.contactEmail || "",
    source: gig.source || "manual",
    googleCalendar: gig.googleCalendar?.eventId ? gig.googleCalendar : null,
  };
}

function createInitialCalendarState() {
  const today = new Date();
  return { month: today.getMonth(), year: today.getFullYear() };
}

function syncCalendarDate() {
  const normalized = new Date(calendarState.year, calendarState.month, 1);
  calendarState.month = normalized.getMonth();
  calendarState.year = normalized.getFullYear();
}

function calculateEquipmentNet() {
  return state.equipment.reduce((total, item) => total + (item.type === "Prodano" ? item.price : -item.price), 0);
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getNextDateKey(value) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + 1);
  return getDateKey(date);
}

function formatFullDate(value) {
  return parseLocalDate(value).toLocaleDateString("hr-HR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}


function formatTimeFromDateTime(value) {
  return new Date(value).toLocaleTimeString("hr-HR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function extractEmailAddress(value) {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : "";
}

function extractPhoneNumber(value) {
  const match = value.match(/(\+?\d[\d\s/().-]{6,}\d)/);
  return match ? match[0].trim() : "";
}

function buildTelHref(value) {
  const normalized = String(value).replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : "#";
}

function buildMailtoHref(value) {
  return `mailto:${String(value).trim()}`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("hr-HR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function getWeekNumber(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
}

function localeSort(a, b) {
  return a.localeCompare(b, "hr");
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function toAmount(value) {
  return Number.parseFloat(value) || 0;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isPastDate(value) {
  return Boolean(value) && parseLocalDate(value).getTime() < getStartOfToday().getTime();
}

function getStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isHttpOrigin() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    throw new Error(payload?.error || "Zahtjev nije uspio.");
  }
  return payload;
}

window.googleIdentityLoaded = function googleIdentityLoaded() {
  googleCalendarRuntime.ready = true;
  renderGoogleCalendarControls();
};
