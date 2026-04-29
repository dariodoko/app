const initialState = {
  user: null,
  billing: null,
  settings: {
    clientId: "",
    calendarId: "primary",
  },
  bands: [],
  bandDirectory: [],
  gigs: [],
  equipment: [],
};

const DEFAULT_BAND_DIRECTORY = [
  "BEHAR",
  "BONUS BAND OSIJEK",
  "BOSUTSKI BEĆARI",
  "DYACO",
  "GRUPA DELTA PLOČE",
  "JAKOV JOZINOVIĆ BEND",
  "JELENA ROZGA BEND",
  "MATE BULIĆ BEND",
  "NIGHT EXPRESS",
  "SINNERS",
  "SINOVI RAVNICE",
  "SLAVONSKI SAN",
  "SLAVONSKI VEZ",
  "SOUND",
  "ZLATNE STRUNE",
];

let state = structuredClone(initialState);
let authMode = "login";
let authResetToken = "";
let activeGigDiaryId = null;
let gigSearchQuery = "";
let gigDiaryDateFilter = "";
let financeFilterYear = "";
let financeFilterMonth = "";
const GOOGLE_OAUTH_STORAGE_KEY = "glazbeni_dnevnik_google_oauth";
const licenseApi = window.licenseService || {
  normalizeBilling(billing) {
    return billing && typeof billing === "object" ? billing : null;
  },
  hasActiveLicense(billing) {
    return Boolean(billing?.licenseActive || billing?.accessActive);
  },
  getLicenseState(billing) {
    if (!billing) {
      return "unknown";
    }
    return billing.licenseExpiresAt ? "expired" : "inactive";
  },
  fetchStatus(apiClient) {
    return apiClient("/api/billing/status");
  },
  restorePurchases(apiClient) {
    return apiClient("/api/billing/restore", { method: "POST" });
  },
};
const licenseUiState = {
  loading: false,
  error: "",
  message: "",
};
const PURCHASE_SUCCESS_REDIRECT_MS = 2600;
const APP_LAUNCH_MIN_MS = 850;
let checkoutSessionIdFromLocation = "";
let checkoutSuccessFromLocation = false;
let purchaseRedirectTimeoutId = null;

const elements = {
  authShell: document.getElementById("authShell"),
  authPanel: document.getElementById("authForm")?.closest(".auth-panel"),
  appShell: document.getElementById("appShell"),
  appLaunchScreen: document.getElementById("appLaunchScreen"),
  appLaunchStatus: document.getElementById("appLaunchStatus"),
  authForm: document.getElementById("authForm"),
  authEyebrow: document.getElementById("authEyebrow"),
  authTitle: document.getElementById("authTitle"),
  authIntroCopy: document.getElementById("authIntroCopy"),
  authEmail: document.getElementById("authEmail"),
  authFirstName: document.getElementById("authFirstName"),
  authLastName: document.getElementById("authLastName"),
  authPhone: document.getElementById("authPhone"),
  authPassword: document.getElementById("authPassword"),
  authPasswordConfirm: document.getElementById("authPasswordConfirm"),
  authSubmitButton: document.getElementById("authSubmitButton"),
  authToggleMode: document.getElementById("authToggleMode"),
  authEmailField: document.getElementById("authEmailField"),
  authFirstNameField: document.getElementById("authFirstNameField"),
  authLastNameField: document.getElementById("authLastNameField"),
  authPhoneField: document.getElementById("authPhoneField"),
  authPasswordField: document.getElementById("authPasswordField"),
  authPasswordConfirmField: document.getElementById("authPasswordConfirmField"),
  authStatus: document.getElementById("authStatus"),
  authBillingPanel: document.getElementById("authBillingPanel"),
  authBillingTitle: document.getElementById("authBillingTitle"),
  authBillingMessage: document.getElementById("authBillingMessage"),
  authStartCheckoutButton: document.getElementById("authStartCheckoutButton"),
  paywallPanel: document.getElementById("paywallPanel"),
  paywallTitle: document.getElementById("paywallTitle"),
  paywallMessage: document.getElementById("paywallMessage"),
  paywallStatus: document.getElementById("paywallStatus"),
  paywallFooter: document.getElementById("paywallFooter"),
  paywallCheckoutButton: document.getElementById("paywallCheckoutButton"),
  paywallLogoutButton: document.getElementById("paywallLogoutButton"),
  authRegisterFields: [
    document.getElementById("authFirstNameField"),
    document.getElementById("authLastNameField"),
    document.getElementById("authPhoneField"),
  ].filter(Boolean),
  forgotPasswordButton: document.getElementById("forgotPasswordButton"),
  authBackToLoginButton: document.getElementById("authBackToLoginButton"),
  currentUserName: document.getElementById("currentUserName"),
  currentUserBand: document.getElementById("currentUserBand"),
  currentUserInitial: document.getElementById("currentUserInitial"),
  profileUserEmail: document.getElementById("profileUserEmail"),
  profileForm: document.getElementById("profileForm"),
  profileStatus: document.getElementById("profileStatus"),
  profileBillingPanel: document.getElementById("profileBillingPanel"),
  profileBillingTitle: document.getElementById("profileBillingTitle"),
  profileBillingMessage: document.getElementById("profileBillingMessage"),
  profileBillingStatus: document.getElementById("profileBillingStatus"),
  profileBillingEndsAt: document.getElementById("profileBillingEndsAt"),
  profileBillingPrice: document.getElementById("profileBillingPrice"),
  profileBillingStripeStatus: document.getElementById("profileBillingStripeStatus"),
  profileStartCheckoutButton: document.getElementById("profileStartCheckoutButton"),
  profilePasswordForm: document.getElementById("profilePasswordForm"),
  changePasswordToggleButton: document.getElementById("changePasswordToggleButton"),
  cancelPasswordChangeButton: document.getElementById("cancelPasswordChangeButton"),
  deleteAccountButton: document.getElementById("deleteAccountButton"),
  profileBackupPdfButton: document.getElementById("profileBackupPdfButton"),
  profileGoogleReconnectButton: document.getElementById("profileGoogleReconnectButton"),
  profileGoogleImportButton: document.getElementById("profileGoogleImportButton"),
  showClearGigsFormButton: document.getElementById("showClearGigsFormButton"),
  clearGigsForm: document.getElementById("clearGigsForm"),
  clearGigsPasswordInput: document.getElementById("clearGigsPasswordInput"),
  cancelClearGigsButton: document.getElementById("cancelClearGigsButton"),
  profileFirstName: document.getElementById("profileFirstName"),
  profileLastName: document.getElementById("profileLastName"),
  profileAddress: document.getElementById("profileAddress"),
  profilePhone: document.getElementById("profilePhone"),
  profilePrimaryBand: document.getElementById("profilePrimaryBand"),
  profilePrimaryInstrument: document.getElementById("profilePrimaryInstrument"),
  profileFirstNameInput: document.getElementById("profileFirstNameInput"),
  profileLastNameInput: document.getElementById("profileLastNameInput"),
  profileAddressInput: document.getElementById("profileAddressInput"),
  profilePhoneInput: document.getElementById("profilePhoneInput"),
  profilePrimaryBandInput: document.getElementById("profilePrimaryBandInput"),
  profileBandDropdown: document.getElementById("profileBandDropdown"),
  profilePrimaryInstrumentInput: document.getElementById("profilePrimaryInstrumentInput"),
  currentPasswordInput: document.getElementById("currentPasswordInput"),
  newPasswordInput: document.getElementById("newPasswordInput"),
  confirmNewPasswordInput: document.getElementById("confirmNewPasswordInput"),
  hero: document.querySelector(".hero"),
  recentCompletedGigs: document.getElementById("recentCompletedGigs"),
  quickMenuToggle: document.getElementById("quickMenuToggle"),
  quickMenuPanel: document.getElementById("quickMenuPanel"),
  gigDiaryModal: document.getElementById("gigDiaryModal"),
  gigDiaryCloseButton: document.getElementById("gigDiaryCloseButton"),
  gigDiaryTitle: document.getElementById("gigDiaryTitle"),
  gigDiaryList: document.getElementById("gigDiaryList"),
  gigDiaryDetail: document.getElementById("gigDiaryDetail"),
  gigSearchInput: document.getElementById("gigSearchInput"),
  gigDiarySearchRow: document.querySelector("#gigDiaryModal .diary-search-row"),
  homeGigSearchInput: document.getElementById("homeGigSearchInput"),
  homeGigSearchResults: document.getElementById("homeGigSearchResults"),
  logoutButton: document.getElementById("logoutButton"),
  seedDemoButton: document.getElementById("seedDemoButton"),
  tabs: [...document.querySelectorAll(".tab-button")],
  panels: [...document.querySelectorAll(".tab-panel")],
  gigComposerSection: document.getElementById("gigComposerSection"),
  gigComposerCloseButton: document.getElementById("gigComposerCloseButton"),
  gigForm: document.getElementById("gigForm"),
  gigId: document.getElementById("gigId"),
  gigSubmitButton: document.getElementById("gigSubmitButton"),
  gigPrintReceiptButton: document.getElementById("gigPrintReceiptButton"),
  gigCancelEditButton: document.getElementById("gigCancelEditButton"),
  equipmentForm: document.getElementById("equipmentForm"),
  equipmentId: document.getElementById("equipmentId"),
  equipmentSubmitButton: document.getElementById("equipmentSubmitButton"),
  equipmentCancelEditButton: document.getElementById("equipmentCancelEditButton"),
  bandSuggestions: document.getElementById("bandSuggestions"),
  bandName: document.getElementById("bandName"),
  bandDropdown: document.getElementById("bandDropdown"),
  contractorSuggestions: document.getElementById("contractorSuggestions"),
  gigDate: document.getElementById("gigDate"),
  gigNetEarning: document.getElementById("gigNetEarning"),
  gigNetEarningHint: document.getElementById("gigNetEarningHint"),
  gigAdvance: document.getElementById("gigAdvance"),
  gigPrintAdvanceReceipt: document.getElementById("gigPrintAdvanceReceipt"),
  gigList: document.getElementById("gigList"),
  equipmentList: document.getElementById("equipmentList"),
  calendarGrid: document.getElementById("calendarGrid"),
  calendarLabel: document.getElementById("calendarLabel"),
  prevMonth: document.getElementById("prevMonth"),
  nextMonth: document.getElementById("nextMonth"),
  financeYearFilter: document.getElementById("financeYearFilter"),
  financeMonthFilter: document.getElementById("financeMonthFilter"),
  financePeriodResults: document.getElementById("financePeriodResults"),
  googleCalendarSelect: document.getElementById("googleCalendarSelect"),
  googleCalendarStatus: document.getElementById("googleCalendarStatus"),
  googleConnectButton: document.getElementById("googleConnectButton"),
  googleDisconnectButton: document.getElementById("googleDisconnectButton"),
  googleImportButton: document.getElementById("googleImportButton"),
  googleCalendarPanel: document.querySelector(".google-calendar-panel"),
};

const calendarState = createInitialCalendarState();
const googleCalendarRuntime = {
  accessToken: null,
  ready: true,
};
const appLaunchState = {
  startedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
  hidden: false,
};

boot();

async function boot() {
  try {
    setLaunchStatus("Pokretanje aplikacije...");
    registerServiceWorker();
    bindEvents();
    setDefaultDates();
    syncGigNetEarningAvailability();
    syncAdvanceReceiptAvailability();
    syncAuthModeFromLocation();
    syncCheckoutStateFromLocation();
    renderAuthMode();

    setLaunchStatus("Provjera korisnickog racuna...");
    const sessionResponse = await api("/api/auth/me");
    if (sessionResponse.user) {
      state.user = sessionResponse.user;
      state.billing = sessionResponse.user.billing || null;
      setLaunchStatus("Ucitavanje tvojih podataka...");
      const canEnterApp = await guardAppEntry({
        loadProtectedData: true,
        delayAfterSuccessfulPurchase: checkoutSuccessFromLocation,
      });
      if (canEnterApp) {
        setLaunchStatus("Sinkronizacija aplikacije...");
        await finalizeGoogleRedirectSession();
      }
    } else {
      if (checkoutSessionIdFromLocation) {
        setLaunchStatus("Dovrsavanje registracije...");
        await completePendingRegistrationAfterCheckout();
        return;
      }
      renderAuthOnly();
    }
  } catch (error) {
    renderAuthOnly();
    if (elements.authStatus) {
      elements.authStatus.textContent = error?.message || "Aplikacija se nije uspjela pokrenuti. Pokusaj ponovno.";
    }
  } finally {
    await hideLaunchScreen();
  }
}

function setLaunchStatus(message) {
  if (elements.appLaunchStatus) {
    elements.appLaunchStatus.textContent = message;
  }
}

async function hideLaunchScreen() {
  if (appLaunchState.hidden || !elements.appLaunchScreen) {
    return;
  }

  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const elapsed = now - appLaunchState.startedAt;
  const remaining = Math.max(0, APP_LAUNCH_MIN_MS - elapsed);
  if (remaining > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, remaining));
  }

  elements.appLaunchScreen.classList.add("is-hidden");
  appLaunchState.hidden = true;
  window.setTimeout(() => {
    elements.appLaunchScreen?.remove();
  }, 360);
}

function bindEvents() {
  elements.authForm.addEventListener("submit", handleAuthSubmit);
  elements.authToggleMode.addEventListener("click", toggleAuthMode);
  elements.authStartCheckoutButton?.addEventListener("click", handleBillingCheckout);
  elements.paywallCheckoutButton?.addEventListener("click", handleBillingCheckout);
  elements.paywallLogoutButton?.addEventListener("click", handleLogout);
  elements.forgotPasswordButton?.addEventListener("click", openForgotPasswordMode);
  elements.authBackToLoginButton?.addEventListener("click", () => setAuthMode("login"));
  elements.quickMenuToggle?.addEventListener("click", toggleQuickMenu);
  elements.gigDiaryCloseButton?.addEventListener("click", closeGigDiaryModal);
  elements.gigSearchInput?.addEventListener("input", handleGigSearchInput);
  elements.homeGigSearchInput?.addEventListener("input", handleGigSearchInput);
  elements.financeYearFilter?.addEventListener("change", handleFinanceYearFilterChange);
  elements.financeMonthFilter?.addEventListener("change", handleFinanceMonthFilterChange);
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.seedDemoButton?.addEventListener("click", handleSeedDemo);

  elements.tabs.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  elements.bandName.addEventListener("focus", () => renderBandDropdown(elements.bandName.value));
  elements.bandName.addEventListener("click", () => renderBandDropdown(elements.bandName.value));
  elements.bandName.addEventListener("input", () => renderBandDropdown(elements.bandName.value));
  elements.profilePrimaryBandInput?.addEventListener("focus", () => renderBandDropdown(elements.profilePrimaryBandInput.value, "profile"));
  elements.profilePrimaryBandInput?.addEventListener("click", () => renderBandDropdown(elements.profilePrimaryBandInput.value, "profile"));
  elements.profilePrimaryBandInput?.addEventListener("input", () => renderBandDropdown(elements.profilePrimaryBandInput.value, "profile"));
  elements.gigDate.addEventListener("input", syncGigNetEarningAvailability);
  elements.gigAdvance?.addEventListener("input", syncAdvanceReceiptAvailability);

  elements.gigForm.addEventListener("submit", handleGigSubmit);
  elements.gigPrintReceiptButton?.addEventListener("click", handleAdvanceReceiptPrint);
  elements.gigComposerCloseButton?.addEventListener("click", () => {
    resetGigForm();
    hideGigComposer();
  });
  elements.gigCancelEditButton.addEventListener("click", () => {
    resetGigForm();
    hideGigComposer();
  });
  elements.equipmentForm.addEventListener("submit", handleEquipmentSubmit);
  elements.equipmentCancelEditButton.addEventListener("click", resetEquipmentForm);

  elements.googleCalendarSelect.addEventListener("change", handleGoogleCalendarSelection);
  elements.googleConnectButton.addEventListener("click", handleGoogleConnect);
  elements.googleDisconnectButton.addEventListener("click", handleGoogleDisconnect);
  elements.googleImportButton.addEventListener("click", handleGoogleImport);
  elements.profileForm?.addEventListener("submit", handleProfileSubmit);
  elements.profileStartCheckoutButton?.addEventListener("click", handleBillingCheckout);
  elements.profilePasswordForm?.addEventListener("submit", handleProfilePasswordSubmit);
  elements.changePasswordToggleButton?.addEventListener("click", openProfilePasswordForm);
  elements.cancelPasswordChangeButton?.addEventListener("click", closeProfilePasswordForm);
  elements.profileBackupPdfButton?.addEventListener("click", handleProfileBackupPdf);
  elements.profileGoogleReconnectButton?.addEventListener("click", handleProfileGoogleReconnect);
  elements.profileGoogleImportButton?.addEventListener("click", handleProfileGoogleImport);
  elements.showClearGigsFormButton?.addEventListener("click", openClearGigsForm);
  elements.cancelClearGigsButton?.addEventListener("click", closeClearGigsForm);
  elements.clearGigsForm?.addEventListener("submit", handleClearGigsSubmit);
  elements.deleteAccountButton?.addEventListener("click", handleAccountDelete);

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
  document.addEventListener("keydown", handleDocumentKeydown);
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  if ((authMode === "register" || authMode === "reset") && !isPasswordStrongEnough(elements.authPassword.value)) {
    elements.authStatus.textContent = "Lozinka mora imati najmanje 8 znakova i barem jedan broj.";
    return;
  }

  if ((authMode === "register" || authMode === "reset") && elements.authPassword.value !== elements.authPasswordConfirm.value) {
    elements.authStatus.textContent = "Lozinke se ne podudaraju.";
    return;
  }

  try {
    if (authMode === "forgot") {
      const result = await api("/api/auth/forgot-password", {
        method: "POST",
        body: { email: elements.authEmail.value.trim() },
      });
      elements.authStatus.textContent = result?.message || "Ako racun postoji, poslali smo link za reset lozinke.";
      return;
    }

    if (authMode === "reset") {
      const result = await api("/api/auth/reset-password", {
        method: "POST",
        body: {
          token: authResetToken,
          password: elements.authPassword.value,
        },
      });
      clearResetTokenFromLocation();
      elements.authPassword.value = "";
      elements.authPasswordConfirm.value = "";
      setAuthMode("login");
      elements.authStatus.textContent = result?.message || "Nova lozinka je spremljena.";
      return;
    }

    const payload = {
      email: elements.authEmail.value.trim(),
      password: elements.authPassword.value,
    };

    if (authMode === "register") {
      payload.firstName = elements.authFirstName.value.trim();
      payload.lastName = elements.authLastName.value.trim();
      payload.phone = elements.authPhone.value.trim();
    }

    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    if (authMode === "register") {
      await startRegistrationCheckout(payload);
      return;
    }

    const result = await api(endpoint, {
      method: "POST",
      body: payload,
    });
    if (authMode === "register") {
      elements.authStatus.textContent = result?.registrationEmailSent === false
        ? `Racun je kreiran, ali registracijski email nije poslan.${result?.registrationEmailError ? ` ${result.registrationEmailError}` : ""}`
        : "Racun je kreiran.";
    } else {
      elements.authStatus.textContent = "Prijava uspjesna.";
    }
    elements.authPassword.value = "";
    state.user = result.user;
    state.billing = result.user?.billing || null;
    licenseUiState.message = authMode === "register"
      ? "Racun je spreman. Dovrsi kupnju licence za ulazak u aplikaciju."
      : "";
    await guardAppEntry({ loadProtectedData: true, forceStatusRefresh: true });
  } catch (error) {
    if (error.statusCode === 402) {
      state.billing = error.billing || state.billing;
      licenseUiState.error = error.message;
      renderPaywall();
      return;
    }
    elements.authStatus.textContent = error.message;
  }
}

function toggleAuthMode() {
  setAuthMode(authMode === "login" ? "register" : "login");
}

function renderAuthMode() {
  const isLogin = authMode === "login";
  const isRegister = authMode === "register";
  const isForgot = authMode === "forgot";
  const isReset = authMode === "reset";

  if (elements.authEyebrow) {
    elements.authEyebrow.textContent = isRegister ? "Registracija" : isForgot || isReset ? "Pristup" : "designed by CTRL WAVE";
  }
  if (elements.authIntroCopy) {
    elements.authIntroCopy.textContent = isLogin
      ? "Dobrodošli u aplikaciju za glazbenike koja objedinjuje sve što vam je potrebno na jednom mjestu."
      : isRegister
        ? "Račun i licenca bit ce povezani s emailom koji upisujes u ovoj formi."
        : isForgot
          ? "Upisi email računa i poslat cemo ti poveznicu za postavljanje nove lozinke."
          : "Postavi novu lozinku za isti korisnicki račun.";
  }

  elements.authTitle.textContent = isLogin
    ? "Prijavi se ili registriraj"
    : isRegister
      ? "Kreiraj racun i nastavi na placanje"
      : isForgot
        ? "Zaboravljena lozinka"
        : "Postavi novu lozinku";
  elements.authSubmitButton.textContent = isLogin
    ? "Prijava"
    : isRegister
      ? "Nastavi na placanje"
      : isForgot
        ? "Posalji link"
        : "Spremi lozinku";
  elements.authToggleMode.textContent = isLogin ? "Nemam račun" : "Vec imam račun";
  elements.authStatus.textContent = isLogin
    ? "Ako već imate račun samo se logirajte. Za kreiranje novog računa kliknite Nemam račun i nastavite s registracijom."
    : isRegister
      ? "Ispuni podatke jednom i nastavi na sigurnu aktivaciju licence za isti email. Lozinka mora imati najmanje 8 znakova i barem jedan broj."
      : isForgot
        ? "Upisi email i poslat cemo ti poveznicu za novu lozinku."
        : "Unesi novu lozinku. Lozinka mora imati najmanje 8 znakova i barem jedan broj.";

  elements.authEmailField?.classList.toggle("hidden", isReset);
  elements.authPasswordField?.classList.toggle("hidden", isForgot);
  elements.authPasswordConfirmField?.classList.toggle("hidden", !isRegister && !isReset);
  elements.authRegisterFields.forEach((field) => field.classList.toggle("hidden", !isRegister));
  elements.authToggleMode.classList.toggle("hidden", isForgot || isReset);
  elements.forgotPasswordButton?.classList.toggle("hidden", !isLogin);
  elements.authBackToLoginButton?.classList.toggle("hidden", !isForgot && !isReset);

  elements.authEmail.required = !isReset;
  elements.authPassword.required = !isForgot;
  elements.authFirstName.required = isRegister;
  elements.authLastName.required = isRegister;
  elements.authPhone.required = isRegister;
  elements.authPasswordConfirm.required = isRegister || isReset;

  if (!isRegister) {
    elements.authFirstName.value = "";
    elements.authLastName.value = "";
    elements.authPhone.value = "";
  }

  if (isLogin || isForgot) {
    elements.authPasswordConfirm.value = "";
  }

}

function setAuthMode(nextMode) {
  authMode = nextMode;
  if (nextMode !== "reset") {
    authResetToken = "";
    if (nextMode === "login" || nextMode === "register" || nextMode === "forgot") {
      clearResetTokenFromLocation();
    }
  }
  renderAuthMode();
}

function openForgotPasswordMode() {
  setAuthMode("forgot");
}

function syncAuthModeFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get("resetToken");
  if (resetToken) {
    authResetToken = resetToken;
    authMode = "reset";
  }
}

function clearResetTokenFromLocation() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("resetToken")) {
    return;
  }

  params.delete("resetToken");
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || ""}`;
  history.replaceState(null, "", nextUrl);
}

function isPasswordStrongEnough(password) {
  return typeof password === "string" && password.length >= 8 && /\d/.test(password);
}

async function startRegistrationCheckout(payload) {
  licenseUiState.error = "";
  licenseUiState.message = "Otvaramo sigurnu naplatu za registraciju i licencu...";
  renderAuthOnly();
  const result = await api("/api/public/billing/checkout-session", {
    method: "POST",
    body: payload,
  });
  if (!result?.url) {
    throw new Error("Stripe checkout URL nije dostupan.");
  }
  window.location.assign(result.url);
}

async function completePendingRegistrationAfterCheckout() {
  if (!checkoutSessionIdFromLocation) {
    renderAuthOnly();
    return;
  }

  try {
    const result = await api("/api/auth/complete-registration-checkout", {
      method: "POST",
      body: { checkoutSessionId: checkoutSessionIdFromLocation },
    });
    state.user = result.user;
    state.billing = result.user?.billing || null;
    licenseUiState.message = "Kupnja je dovrsena i račun je aktiviran.";
    checkoutSessionIdFromLocation = "";
    await guardAppEntry({
      loadProtectedData: true,
      forceStatusRefresh: true,
      delayAfterSuccessfulPurchase: true,
    });
  } catch (error) {
    checkoutSessionIdFromLocation = "";
    elements.authStatus.textContent = error.message;
    renderAuthOnly();
  }
}

async function handleLogout() {
  await api("/api/auth/logout", { method: "POST" });
  clearPurchaseRedirectTimeout();
  state = structuredClone(initialState);
  googleCalendarRuntime.accessToken = null;
  googleCalendarRuntime.tokenClient = null;
  authMode = "login";
  authResetToken = "";
  licenseUiState.loading = false;
  licenseUiState.error = "";
  licenseUiState.message = "";
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
}

function applyBootstrapState(data) {
  state = {
    user: data.user,
    billing: data.user?.billing || state.billing,
    settings: data.settings || { clientId: "", calendarId: "primary" },
    bands: Array.isArray(data.bands) ? data.bands : [],
    bandDirectory: Array.isArray(data.bandDirectory) ? data.bandDirectory : [],
    gigs: Array.isArray(data.gigs) ? data.gigs.map(normalizeGig) : [],
    equipment: Array.isArray(data.equipment) ? data.equipment : [],
  };
}

function renderAuthOnly() {
  clearPurchaseRedirectTimeout();
  syncAuthModeFromLocation();
  renderAuthMode();
  renderBillingState();
  elements.authPanel?.classList.remove("hidden");
  elements.paywallPanel?.classList.add("hidden");
  elements.authShell.classList.remove("hidden");
  elements.appShell.classList.add("hidden");
  closeQuickMenu();
  closeGigDiaryModal();
}

function renderBillingLocked() {
  syncAuthModeFromLocation();
  setAuthMode("login");
  licenseUiState.message = "Licenca nije aktivna. Kupi ili obnovi licencu za nastavak rada.";
  renderPaywall();
}

function renderApp() {
  clearPurchaseRedirectTimeout();
  elements.authShell.classList.add("hidden");
  elements.appShell.classList.remove("hidden");
  closeQuickMenu();
  render();
}

function render() {
  const activeEmail = state.user?.email || "-";
  const fullName = [state.user?.firstName, state.user?.lastName].filter(Boolean).join(" ").trim() || activeEmail;
  const primaryBand = state.user?.primaryBand?.trim() || "Glavni bend nije upisan";
  const initialSeed = state.user?.firstName || state.user?.email || "G";

  elements.currentUserName.textContent = fullName;
  elements.currentUserBand.textContent = primaryBand;
  elements.currentUserInitial.textContent = initialSeed.charAt(0).toUpperCase();
  if (elements.profileUserEmail) {
    elements.profileUserEmail.textContent = activeEmail;
  }
  if (elements.profileFirstName) {
    elements.profileFirstName.textContent = state.user?.firstName || "-";
    elements.profileLastName.textContent = state.user?.lastName || "-";
    elements.profileAddress.textContent = state.user?.address || "-";
    elements.profilePhone.textContent = state.user?.phone || "-";
    elements.profilePrimaryBand.textContent = state.user?.primaryBand || "-";
    elements.profilePrimaryInstrument.textContent = state.user?.primaryInstrument || "-";
    elements.profileFirstNameInput.value = state.user?.firstName || "";
    elements.profileLastNameInput.value = state.user?.lastName || "";
    elements.profileAddressInput.value = state.user?.address || "";
    elements.profilePhoneInput.value = state.user?.phone || "";
    elements.profilePrimaryBandInput.value = state.user?.primaryBand || "";
    elements.profilePrimaryInstrumentInput.value = state.user?.primaryInstrument || "";
  }
  renderBillingState();
  closeProfilePasswordForm();
  renderGoogleCalendarControls();
  renderHeroStats();
  renderRecentCompletedGigs();
  renderSuggestions();
  renderHomeGigSearchResults();
  renderGigDiary();
  renderCalendar();
  renderFinanceSummary();
  renderFinancePeriodFilters();
  renderFinancePeriodResults();
  renderEquipmentSummary();
  renderEquipmentList();
}

function getBillingSnapshot() {
  return licenseApi.normalizeBilling(state.billing || state.user?.billing) || {
    accessActive: false,
    licenseActive: false,
    licenseStatus: "inactive",
    licenseExpiresAt: "",
    priceLabel: "25,00 EUR / 1 godina",
    stripeEnabled: true,
    requiresPayment: true,
  };
}

function hasProtectedAppAccess() {
  return licenseApi.hasActiveLicense(getBillingSnapshot());
}

async function refreshLicenseStatus({ showLoading = false } = {}) {
  if (!state.user) {
    return getBillingSnapshot();
  }

  if (showLoading) {
    licenseUiState.loading = true;
    licenseUiState.error = "";
    renderPaywall();
  }

  try {
    const billing = await licenseApi.fetchStatus(api);
    state.billing = billing;
    if (state.user) {
      state.user.billing = billing;
    }
    licenseUiState.loading = false;
    licenseUiState.error = "";
    return billing;
  } catch (error) {
    if (error.billing) {
      state.billing = error.billing;
      if (state.user) {
        state.user.billing = error.billing;
      }
    }
    licenseUiState.loading = false;
    licenseUiState.error = error.message;
    throw error;
  }
}

async function guardAppEntry({
  loadProtectedData = true,
  forceStatusRefresh = true,
  delayAfterSuccessfulPurchase = false,
} = {}) {
  if (!state.user) {
    renderAuthOnly();
    return false;
  }

  try {
    if (forceStatusRefresh) {
      await refreshLicenseStatus({ showLoading: true });
    }
  } catch (_error) {
    renderPaywall();
    return false;
  }

  if (!hasProtectedAppAccess()) {
    renderPaywall();
    return false;
  }

  if (loadProtectedData) {
    try {
      await loadBootstrap();
    } catch (error) {
      if (error.statusCode === 402) {
        state.billing = error.billing || state.billing;
      }
      licenseUiState.error = error.message;
      renderPaywall();
      return false;
    }
  }

  if (delayAfterSuccessfulPurchase) {
    await showPurchaseSuccessPause();
  }

  renderApp();
  return true;
}

function syncCheckoutStateFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get("checkout");
  checkoutSessionIdFromLocation = params.get("session_id") || "";
  checkoutSuccessFromLocation = checkout === "success";
  if (checkout === "success") {
    licenseUiState.message = "Uplata je zaprimljena. Provjeravamo licencu i pripremamo pristup aplikaciji.";
  } else if (checkout === "cancelled") {
    licenseUiState.message = "Kupnja je prekinuta prije dovrsetka. Sigurnu naplatu mozes otvoriti ponovno.";
  }

  if (!checkout) {
    return;
  }

  params.delete("checkout");
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || ""}`;
  history.replaceState(null, "", nextUrl);
}

function clearPurchaseRedirectTimeout() {
  if (purchaseRedirectTimeoutId !== null) {
    window.clearTimeout(purchaseRedirectTimeoutId);
    purchaseRedirectTimeoutId = null;
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    purchaseRedirectTimeoutId = window.setTimeout(() => {
      purchaseRedirectTimeoutId = null;
      resolve();
    }, ms);
  });
}

async function showPurchaseSuccessPause() {
  clearPurchaseRedirectTimeout();
  licenseUiState.loading = false;
  licenseUiState.error = "";
  licenseUiState.message = "Godisnja licenca je aktivna. Za trenutak ulazis u aplikaciju.";
  renderPaywall();
  await wait(PURCHASE_SUCCESS_REDIRECT_MS);
  checkoutSuccessFromLocation = false;
}

function renderPaywall() {
  renderBillingState();
  elements.authPanel?.classList.add("hidden");
  elements.paywallPanel?.classList.remove("hidden");
  elements.authShell.classList.remove("hidden");
  elements.appShell.classList.add("hidden");
  closeQuickMenu();
  closeGigDiaryModal();
}

function renderBillingState() {
  const billing = getBillingSnapshot();
  const licenseState = licenseApi.getLicenseState(billing);
  const title = billing.licenseActive
    ? "Godišnja licenca je aktivna"
    : licenseState === "expired"
      ? "Licenca je istekla"
      : "Licenca nije aktivna";
  const message = billing.licenseActive
    ? `Tvoj račun ima aktivnu godišnju licencu${billing.licenseExpiresAt ? `, vrijedi do ${formatDateShort(billing.licenseExpiresAt)}.` : "."}`
    : billing.stripeEnabled
      ? `Pristup aplikaciji aktiviras kupnjom licence na 1 godinu za ${billing.priceLabel}. Naplata je vezana uz email s kojim si se prijavio ili registrirao.`
      : "Online naplata trenutno nije dostupna jer Stripe jos nije konfiguriran na serveru.";
  const statusLabel = billing.licenseActive
    ? "Godišnja licenca"
    : licenseState === "expired"
      ? "Istekla licenca"
      : "Čeka uplatu";
  const paywallStatus = licenseUiState.loading
    ? "Provjeravamo status licence..."
    : licenseUiState.error
      ? `Provjera licence nije uspjela: ${licenseUiState.error}`
      : licenseUiState.message
        ? licenseUiState.message
        : billing.licenseActive
          ? "Licenca je aktivna. Preusmjeravamo te u aplikaciju."
          : licenseState === "expired"
            ? "Prethodna licenca je istekla. Aktiviraj novu licencu za nastavak rada."
            : "Aktivna licenca potrebna je za pristup aplikaciji.";

  elements.authBillingPanel?.classList.remove("hidden");
  if (elements.authBillingTitle) {
    elements.authBillingTitle.textContent = "Jedan email, jedan račun i jedna licenca";
  }
  if (elements.authBillingMessage) {
    elements.authBillingMessage.textContent = "Novi korisnici ispunjavaju podatke jednom i nastavljaju na placanje, a postojeci se prijavljuju i po potrebi aktiviraju licencu.";
  }
  if (elements.profileBillingTitle) {
    elements.profileBillingTitle.textContent = title;
  }
  if (elements.profileBillingMessage) {
    elements.profileBillingMessage.textContent = message;
  }
  if (elements.profileBillingStatus) {
    elements.profileBillingStatus.textContent = statusLabel;
  }
  if (elements.profileBillingEndsAt) {
    elements.profileBillingEndsAt.textContent = billing.licenseExpiresAt
      ? formatDateShort(billing.licenseExpiresAt)
      : "-";
  }
  if (elements.profileBillingPrice) {
    elements.profileBillingPrice.textContent = billing.priceLabel || "-";
  }
  if (elements.profileBillingStripeStatus) {
    elements.profileBillingStripeStatus.textContent = billing.stripeEnabled ? "Spreman" : "Nije konfiguriran";
  }
  if (elements.paywallTitle) {
    elements.paywallTitle.textContent = title;
  }
  if (elements.paywallMessage) {
    elements.paywallMessage.textContent = message;
  }
  if (elements.paywallStatus) {
    elements.paywallStatus.textContent = paywallStatus;
  }
  if (elements.paywallFooter) {
    elements.paywallFooter.textContent = billing.licenseExpiresAt
      ? `Licenca je trenutno aktivna do ${formatDateShort(billing.licenseExpiresAt)}.`
      : "Nakon uspjesne kupnje pristup aplikaciji otkljucava se automatski za isti email.";
  }

  const shouldShowCheckout = !billing.licenseActive;
  const checkoutDisabled = !billing.stripeEnabled || licenseUiState.loading;
  elements.authStartCheckoutButton?.classList.toggle("hidden", !shouldShowCheckout);
  elements.profileStartCheckoutButton?.classList.toggle("hidden", !shouldShowCheckout);
  elements.paywallCheckoutButton?.classList.toggle("hidden", !shouldShowCheckout);
  elements.authStartCheckoutButton?.toggleAttribute("disabled", checkoutDisabled);
  elements.profileStartCheckoutButton?.toggleAttribute("disabled", checkoutDisabled);
  elements.paywallCheckoutButton?.toggleAttribute("disabled", checkoutDisabled);
}

async function handleBillingCheckout() {
  try {
    const email = elements.authEmail?.value.trim() || "";
    if (!state.user && !email) {
      showBillingStatus("Za nastavak prvo unesi mail adresu.");
      return;
    }

    licenseUiState.error = "";
    licenseUiState.message = "Otvaramo sigurnu naplatu licence...";
    renderBillingState();
    const checkoutUrl = state.user
      ? "/api/billing/checkout-session"
      : "/api/public/billing/checkout-session";
    const checkoutBody = state.user
      ? undefined
      : { email };
    const result = await api(checkoutUrl, {
      method: "POST",
      ...(checkoutBody ? { body: checkoutBody } : {}),
    });
    if (!result?.url) {
      throw new Error("Stripe checkout URL nije dostupan.");
    }
    window.location.assign(result.url);
  } catch (error) {
    showBillingStatus(error.message);
  }
}

function showBillingStatus(message) {
  if (!elements.paywallPanel?.classList.contains("hidden")) {
    licenseUiState.error = "";
    licenseUiState.message = message;
    renderBillingState();
    return;
  }

  if (elements.appShell.classList.contains("hidden")) {
    elements.authStatus.textContent = message;
    elements.authStatus.classList.remove("hidden");
    return;
  }

  elements.profileStatus.textContent = message;
  elements.profileStatus.classList.remove("hidden");
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
  const createGigButton = event.target.closest("[data-create-gig-date]");
  const editGigButton = event.target.closest("[data-edit-gig]");
  const fillGigEarningButton = event.target.closest("[data-fill-gig-earning]");
  const deleteGigButton = event.target.closest("[data-delete-gig]");
  const editEquipmentButton = event.target.closest("[data-edit-equipment]");
  const deleteEquipmentButton = event.target.closest("[data-delete-equipment]");
  const homeSearchResult = event.target.closest("[data-home-search-gig]");
  const financeResult = event.target.closest("[data-open-finance-gig]");
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

  if (fillGigEarningButton) {
    openGigNetEarningEntry(fillGigEarningButton.dataset.fillGigEarning);
    return;
  }

  if (diaryRow) {
    setActiveGigDiary(diaryRow.dataset.diaryGig);
    return;
  }

  if (homeSearchResult) {
    openGigDiaryModal(homeSearchResult.dataset.homeSearchGig);
    return;
  }

  if (financeResult) {
    openGigDiaryModal(financeResult.dataset.openFinanceGig, { dateFilter: financeResult.dataset.openFinanceGigDate || "" });
    return;
  }

  if (bandOption) {
    const target = bandOption.dataset.bandTarget === "profile" ? elements.profilePrimaryBandInput : elements.bandName;
    target.value = bandOption.dataset.bandOption;
    hideBandDropdown();
    target.blur();
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
    openGigFromCalendar(openGigButton.dataset.openGig, openGigButton.dataset.openGigDate || "");
    return;
  }

  if (createGigButton) {
    startNewGigFromCalendar(createGigButton.dataset.createGigDate || "");
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
  const shouldPrintAdvanceReceipt = elements.gigPrintAdvanceReceipt?.checked;

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
    let savedGig;
    if (elements.gigId.value) {
      const updated = await api(`/api/gigs/${elements.gigId.value}`, {
        method: "PUT",
        body: payload,
      });
      savedGig = normalizeGig(updated);
      state.gigs = state.gigs.map((gig) => (gig.id === savedGig.id ? savedGig : gig));
    } else {
      const created = await api("/api/gigs", {
        method: "POST",
        body: payload,
      });
      savedGig = normalizeGig(created);
      state.gigs.unshift(savedGig);
    }

    await refreshBandData();
    if (shouldPrintAdvanceReceipt && savedGig?.advance > 0) {
      openAdvanceReceiptPrint(savedGig);
    }
    resetGigForm();
    hideGigComposer();
    render();
  } catch (error) {
    window.alert(error.message);
  }
}

function startGigEdit(gigId) {
  const gig = state.gigs.find((item) => item.id === gigId);
  if (!gig) {
    return;
  }

  showGigComposer();
  elements.gigId.value = gig.id;
  elements.bandName.value = gig.bandName;
  elements.gigDate.value = gig.date;
  document.getElementById("gigTime").value = gig.time || "";
  document.getElementById("gigLocation").value = gig.location;
  document.getElementById("contractorName").value = gig.contractor;
  document.getElementById("contactPhone").value = gig.contactPhone || "";
  document.getElementById("contactEmail").value = gig.contactEmail || "";
  document.getElementById("gigFee").value = gig.fee;
  elements.gigAdvance.value = gig.advance;
  document.getElementById("paymentMethod").value = gig.paymentMethod;
  document.getElementById("gigNotes").value = gig.notes || "";
  syncGigNetEarningAvailability();
  syncAdvanceReceiptAvailability();
  elements.gigNetEarning.value = gig.netEarning == null ? "" : gig.netEarning;
  elements.gigSubmitButton.textContent = "Spremi izmjene";
  elements.gigCancelEditButton.classList.remove("hidden");
  elements.gigForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openGigNetEarningEntry(gigId) {
  if (!gigId) {
    return;
  }

  switchTab("nastupi");
  startGigEdit(gigId);
  requestAnimationFrame(() => {
    elements.gigNetEarning?.focus();
    elements.gigNetEarning?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function handleDocumentKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const calendarDay = event.target.closest("[data-open-gig], [data-create-gig-date]");
  if (!calendarDay) {
    return;
  }

  event.preventDefault();

  if (calendarDay.dataset.openGig) {
    openGigFromCalendar(calendarDay.dataset.openGig, calendarDay.dataset.openGigDate || "");
    return;
  }

  startNewGigFromCalendar(calendarDay.dataset.createGigDate || "");
}

function showGigComposer({ reset = false } = {}) {
  if (reset) {
    resetGigForm();
  }

  elements.gigComposerSection?.classList.remove("hidden");
}

function hideGigComposer() {
  elements.gigComposerSection?.classList.add("hidden");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol !== "http:" && window.location.protocol !== "https:") {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // PWA support is optional; ignore registration failures silently.
    });
  }, { once: true });
}

function resetGigForm() {
  elements.gigForm.reset();
  elements.gigId.value = "";
  setDefaultDates();
  syncGigNetEarningAvailability();
  syncAdvanceReceiptAvailability();
  if (elements.gigPrintAdvanceReceipt) {
    elements.gigPrintAdvanceReceipt.checked = false;
  }
  elements.gigSubmitButton.textContent = "Spremi nastup";
  elements.gigCancelEditButton.classList.add("hidden");
  hideBandDropdown();
}

function handleAdvanceReceiptPrint() {
  const gig = buildGigFromForm();
  if (gig.advance <= 0) {
    window.alert("Upisi iznos avansa veci od 0 za ispis potvrde.");
    return;
  }

  openAdvanceReceiptPrint(gig);
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

function renderRecentCompletedGigs() {
  if (!elements.recentCompletedGigs) {
    return;
  }

  const recentCompletedGigs = [...state.gigs]
    .filter((gig) => isPastDate(gig.date))
    .sort(compareGigsByMostRecent)
    .slice(0, 2);

  if (!recentCompletedGigs.length) {
    elements.recentCompletedGigs.className = "recent-gigs-list empty-state";
    elements.recentCompletedGigs.textContent = "Još nema odrađenih nastupa za prikaz.";
    return;
  }

  elements.recentCompletedGigs.className = "recent-gigs-list";
  elements.recentCompletedGigs.innerHTML = recentCompletedGigs.map((gig) => `
    <article class="recent-gig-card">
      <div class="recent-gig-copy">
        <strong>${escapeHtml(gig.bandName || "Nastup")}</strong>
        <p class="meta">${escapeHtml(formatFullDate(gig.date))}${gig.time ? ` u ${escapeHtml(gig.time)}` : ""}</p>
        <p class="meta">${escapeHtml(gig.location || "Lokacija nije upisana")}</p>
        <p class="recent-gig-earning-status">${gig.netEarning == null ? "Zarada još nije unesena." : `Trenutno upisano: ${escapeHtml(formatCurrency(gig.netEarning))}`}</p>
      </div>
      <button type="button" class="primary-button small-button" data-fill-gig-earning="${escapeAttribute(gig.id)}">Unesi koliko si zaradio</button>
    </article>
  `).join("");
}

function getCombinedBandDirectory() {
  const names = new Map();

  DEFAULT_BAND_DIRECTORY.forEach((name) => {
    if (isLikelyBandName(name)) {
      names.set(name.trim().toLocaleLowerCase("hr"), name.trim());
    }
  });

  state.bandDirectory.forEach((band) => {
    const name = typeof band === "string" ? band.trim() : band?.name?.trim();
    if (isLikelyBandName(name)) {
      names.set(name.toLocaleLowerCase("hr"), name);
    }
  });

  state.bands.forEach((band) => {
    const name = band?.name?.trim();
    if (isLikelyBandName(name)) {
      names.set(name.toLocaleLowerCase("hr"), name);
    }
  });

  return [...names.values()].sort(localeSort);
}

function isLikelyBandName(value) {
  const name = String(value || "").trim();
  if (!name) {
    return false;
  }

  if (name.toLocaleLowerCase("hr") === "instagram") {
    return false;
  }

  return !(
    /@|https?:\/\/|www\./i.test(name)
    || /\+\d[\d\s/.-]{5,}/.test(name)
    || /\d[\d\s/.-]{6,}/.test(name)
  );
}

function renderSuggestions() {
  const bandNames = getCombinedBandDirectory();
  const contractors = [...new Set(state.gigs.map((gig) => gig.contractor).filter(Boolean))].sort(localeSort);

  elements.bandSuggestions.innerHTML = bandNames.map((band) => `<option value="${escapeHtml(band)}"></option>`).join("");
  elements.contractorSuggestions.innerHTML = contractors.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
}

function renderBandDropdown(query = "", target = "gig") {
  const normalizedQuery = query.trim().toLocaleLowerCase("hr");
  const matches = getCombinedBandDirectory()
    .filter((band) => !normalizedQuery || band.toLocaleLowerCase("hr").includes(normalizedQuery));

  if (!matches.length) {
    hideBandDropdown(target);
    return;
  }

  const dropdown = target === "profile" ? elements.profileBandDropdown : elements.bandDropdown;
  dropdown.innerHTML = matches
    .map((band) => `<button type="button" class="autocomplete-option" data-band-option="${escapeHtml(band)}" data-band-target="${target}">${escapeHtml(band)}</button>`)
    .join("");
  dropdown.classList.remove("hidden");
}

function hideBandDropdown(target = null) {
  const dropdowns = target === "profile"
    ? [elements.profileBandDropdown]
    : target === "gig"
      ? [elements.bandDropdown]
      : [elements.bandDropdown, elements.profileBandDropdown];

  dropdowns.filter(Boolean).forEach((dropdown) => {
    dropdown.classList.add("hidden");
    dropdown.innerHTML = "";
  });
}

function isSavedBandName(name) {
  const normalized = name.trim().toLocaleLowerCase("hr");
  return Boolean(normalized) && getCombinedBandDirectory().some((band) => band.trim().toLocaleLowerCase("hr") === normalized);
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
  await refreshBandData();
  render();
}

async function handleBandDelete(bandId) {
  await api(`/api/bands/${bandId}`, { method: "DELETE" });
  await refreshBandData();
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
    const isCurrentMonthDay = date.getMonth() === calendarState.month;
    const interactiveAttributes = isCurrentMonthDay
      ? `${firstGigId ? `data-open-gig="${firstGigId}" data-open-gig-date="${dateKey}"` : `data-create-gig-date="${dateKey}"`} role="button" tabindex="0"`
      : "";

    html.push(`
      <article class="${classes}" ${interactiveAttributes}>
        <strong>${date.getDate()}</strong>
        ${dayGigs.length ? `<span class="calendar-day-dot" aria-hidden="true"></span>` : ""}
      </article>
    `);
  }

  elements.calendarGrid.innerHTML = html.join("");
}

function openGigFromCalendar(gigId, dateKey = "") {
  switchTab("nastupi");
  openGigDiaryModal(gigId, { dateFilter: dateKey });
}

function startNewGigFromCalendar(dateKey) {
  if (!dateKey) {
    return;
  }

  switchTab("nastupi");
  showGigComposer({ reset: true });
  elements.gigDate.value = dateKey;
  syncGigNetEarningAvailability();
  syncAdvanceReceiptAvailability();
  elements.bandName?.focus();
  elements.gigForm?.scrollIntoView({ behavior: "smooth", block: "start" });
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

function handleFinanceYearFilterChange(event) {
  financeFilterYear = event.target.value;
  financeFilterMonth = "";
  renderFinancePeriodFilters();
  renderFinancePeriodResults();
}

function handleFinanceMonthFilterChange(event) {
  financeFilterMonth = event.target.value;
  renderFinancePeriodResults();
}

function renderFinancePeriodFilters() {
  if (!elements.financeYearFilter || !elements.financeMonthFilter) {
    return;
  }

  const years = [...new Set(state.gigs.map((gig) => parseLocalDate(gig.date).getFullYear()))]
    .sort((a, b) => b - a);

  if (!years.length) {
    financeFilterYear = "";
    financeFilterMonth = "";
    elements.financeYearFilter.innerHTML = `<option value="">Odaberi godinu</option>`;
    elements.financeMonthFilter.innerHTML = `<option value="">Odaberi mjesec</option>`;
    elements.financeMonthFilter.disabled = true;
    return;
  }

  if (financeFilterYear && !years.includes(Number(financeFilterYear))) {
    financeFilterYear = "";
  }

  elements.financeYearFilter.innerHTML = `
    <option value="">Odaberi godinu</option>
    ${years.map((year) => `<option value="${year}" ${String(year) === financeFilterYear ? "selected" : ""}>${year}</option>`).join("")}
  `;

  const months = [...new Set(
    state.gigs
      .filter((gig) => String(parseLocalDate(gig.date).getFullYear()) === financeFilterYear)
      .map((gig) => parseLocalDate(gig.date).getMonth() + 1),
  )].sort((a, b) => a - b);

  if (!financeFilterYear || !months.length) {
    financeFilterMonth = "";
    elements.financeMonthFilter.innerHTML = `<option value="">Odaberi mjesec</option>`;
    elements.financeMonthFilter.disabled = true;
    return;
  }

  if (financeFilterMonth && !months.includes(Number(financeFilterMonth))) {
    financeFilterMonth = "";
  }

  elements.financeMonthFilter.disabled = false;
  elements.financeMonthFilter.innerHTML = `
    <option value="">Odaberi mjesec</option>
    ${months.map((month) => {
      const value = String(month).padStart(2, "0");
      const label = new Date(2026, month - 1, 1).toLocaleDateString("hr-HR", { month: "long" });
      return `<option value="${value}" ${value === financeFilterMonth ? "selected" : ""}>${capitalize(label)}</option>`;
    }).join("")}
  `;
}

function renderFinancePeriodResults() {
  if (!elements.financePeriodResults) {
    return;
  }

  if (!state.gigs.length) {
    elements.financePeriodResults.className = "breakdown-table empty-state";
    elements.financePeriodResults.textContent = "Jos nema upisanih nastupa.";
    return;
  }

  if (!financeFilterYear || !financeFilterMonth) {
    elements.financePeriodResults.className = "breakdown-table empty-state";
    elements.financePeriodResults.textContent = "Odaberi godinu i mjesec za prikaz događaja.";
    return;
  }

  const visibleGigs = state.gigs
    .filter((gig) => {
      const date = parseLocalDate(gig.date);
      return String(date.getFullYear()) === financeFilterYear
        && String(date.getMonth() + 1).padStart(2, "0") === financeFilterMonth;
    })
    .sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`));

  if (!visibleGigs.length) {
    elements.financePeriodResults.className = "breakdown-table empty-state";
    elements.financePeriodResults.textContent = "Nema događaja u odabranom periodu.";
    return;
  }

  elements.financePeriodResults.className = "breakdown-table";
  elements.financePeriodResults.innerHTML = `
    <div class="breakdown-row header">
      <span>Datum</span>
      <span>Događaj</span>
      <span>Avans</span>
      <span>Zarada</span>
    </div>
    ${visibleGigs.map((gig) => `
      <button type="button" class="breakdown-row breakdown-row-action" data-open-finance-gig="${gig.id}" data-open-finance-gig-date="${gig.date}">
        <strong>${escapeHtml(formatFullDate(gig.date))}${gig.time ? ` u ${escapeHtml(gig.time)}` : ""}</strong>
        <span>${escapeHtml(gig.bandName)}${gig.location ? ` - ${escapeHtml(gig.location)}` : ""}</span>
        <span>${formatCurrency(gig.advance)}</span>
        <span>${gig.netEarning == null ? "Ceka unos" : formatCurrency(gig.netEarning)}</span>
      </button>
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
  const hasImportedGoogleGigs = state.gigs.some((gig) => gig.source === "google-import");
  elements.googleCalendarPanel?.classList.toggle("hidden", hasImportedGoogleGigs);
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

async function refreshBandData() {
  state.bands = await api("/api/bands");
  state.bandDirectory = await api("/api/band-directory");
}

function switchTab(tabId) {
  if (!hasProtectedAppAccess()) {
    renderPaywall();
    return;
  }

  elements.tabs.forEach((button) => button.classList.toggle("active", button.dataset.tab === tabId));
  elements.panels.forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
  elements.hero?.classList.toggle("hidden", tabId !== "nastupi");
  closeQuickMenu();
}

async function handleProfileSubmit(event) {
  event.preventDefault();

  const payload = {
    firstName: elements.profileFirstNameInput.value.trim(),
    lastName: elements.profileLastNameInput.value.trim(),
    address: elements.profileAddressInput.value.trim(),
    phone: elements.profilePhoneInput.value.trim(),
    primaryBand: elements.profilePrimaryBandInput.value.trim(),
    primaryInstrument: elements.profilePrimaryInstrumentInput.value.trim(),
  };

  try {
    let updatedUser;

    try {
      updatedUser = await api("/api/profile", {
        method: "PUT",
        body: payload,
      });
    } catch (error) {
      // Some environments/proxies reject PUT routes, so retry with POST.
      if (error.statusCode !== 404 && error.statusCode !== 405) {
        throw error;
      }

      updatedUser = await api("/api/profile", {
        method: "POST",
        body: payload,
      });
    }

    state.user = updatedUser.user;
    await refreshBandData();
    elements.profileStatus.textContent = "Podaci su spremljeni.";
    elements.profileStatus.classList.remove("hidden");
    render();
  } catch (error) {
    elements.profileStatus.textContent = error.message;
    elements.profileStatus.classList.remove("hidden");
  }
}

async function handleAccountDelete() {
  const confirmed = window.confirm("Jesi siguran da zelis obrisati racun? Ova akcija trajno brise mail adresu i sve tvoje podatke iz aplikacije.");
  if (!confirmed) {
    return;
  }

  try {
    await api("/api/profile", { method: "DELETE" });
    state = structuredClone(initialState);
    googleCalendarRuntime.accessToken = null;
    googleCalendarRuntime.tokenClient = null;
    renderAuthOnly();
  } catch (error) {
    elements.profileStatus.textContent = error.message;
    elements.profileStatus.classList.remove("hidden");
  }
}

function openProfilePasswordForm() {
  elements.profilePasswordForm?.classList.remove("hidden");
  elements.currentPasswordInput?.focus();
}

function closeProfilePasswordForm() {
  elements.profilePasswordForm?.classList.add("hidden");
  if (elements.currentPasswordInput) {
    elements.currentPasswordInput.value = "";
  }
  if (elements.newPasswordInput) {
    elements.newPasswordInput.value = "";
  }
  if (elements.confirmNewPasswordInput) {
    elements.confirmNewPasswordInput.value = "";
  }
}

function openClearGigsForm() {
  elements.clearGigsForm?.classList.remove("hidden");
  elements.clearGigsPasswordInput?.focus();
}

function closeClearGigsForm() {
  elements.clearGigsForm?.classList.add("hidden");
  if (elements.clearGigsPasswordInput) {
    elements.clearGigsPasswordInput.value = "";
  }
}

async function handleProfileGoogleReconnect() {
  try {
    switchTab("nastupi");
    await handleGoogleConnect();
  } catch (error) {
    elements.profileStatus.textContent = error.message;
    elements.profileStatus.classList.remove("hidden");
  }
}

async function handleProfileGoogleImport() {
  try {
    switchTab("nastupi");
    await handleGoogleImport();
  } catch (error) {
    elements.profileStatus.textContent = error.message;
    elements.profileStatus.classList.remove("hidden");
  }
}

async function handleClearGigsSubmit(event) {
  event.preventDefault();

  const password = elements.clearGigsPasswordInput?.value || "";
  if (!password) {
    elements.profileStatus.textContent = "Unesite lozinku za potvrdu brisanja.";
    elements.profileStatus.classList.remove("hidden");
    return;
  }

  const confirmed = window.confirm("Jesi siguran da zelis obrisati sve događaje iz kalendara? Ova akcija brise sve nastupe iz aplikacije.");
  if (!confirmed) {
    return;
  }

  try {
    const result = await api("/api/gigs/clear", {
      method: "POST",
      body: { password },
    });
    state.gigs = [];
    activeGigDiaryId = null;
    gigDiaryDateFilter = "";
    gigSearchQuery = "";
    closeClearGigsForm();
    render();
    elements.profileStatus.textContent = result?.message || "Svi događaji su obrisani.";
    elements.profileStatus.classList.remove("hidden");
  } catch (error) {
    elements.profileStatus.textContent = error.message;
    elements.profileStatus.classList.remove("hidden");
  }
}

async function handleProfileBackupPdf() {
  try {
    const result = await api("/api/gigs");
    const gigs = Array.isArray(result) ? result : [];
    openCalendarBackupPrint(gigs);
    elements.profileStatus.textContent = "Otvoren je backup pregled. U dijalogu za ispis odaberi Save as PDF.";
    elements.profileStatus.classList.remove("hidden");
  } catch (error) {
    elements.profileStatus.textContent = error.message || "Backup PDF nije moguce pripremiti.";
    elements.profileStatus.classList.remove("hidden");
  }
}

async function handleProfilePasswordSubmit(event) {
  event.preventDefault();

  const currentPassword = elements.currentPasswordInput?.value || "";
  const newPassword = elements.newPasswordInput?.value || "";
  const confirmNewPassword = elements.confirmNewPasswordInput?.value || "";

  if (!isPasswordStrongEnough(newPassword)) {
    elements.profileStatus.textContent = "Nova lozinka mora imati najmanje 8 znakova i barem jedan broj.";
    elements.profileStatus.classList.remove("hidden");
    return;
  }

  if (newPassword !== confirmNewPassword) {
    elements.profileStatus.textContent = "Nove lozinke se ne podudaraju.";
    elements.profileStatus.classList.remove("hidden");
    return;
  }

  try {
    const result = await api("/api/profile/password", {
      method: "POST",
      body: {
        currentPassword,
        newPassword,
      },
    });

    closeProfilePasswordForm();
    elements.profileStatus.textContent = result?.message || "Lozinka je uspjesno promijenjena.";
    elements.profileStatus.classList.remove("hidden");
  } catch (error) {
    elements.profileStatus.textContent = error.message;
    elements.profileStatus.classList.remove("hidden");
  }
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
    if (jumpSection === "gigForm") {
      showGigComposer({ reset: true });
    }

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
  if (elements.gigSearchInput && elements.gigSearchInput.value !== gigSearchQuery) {
    elements.gigSearchInput.value = gigSearchQuery;
  }
  if (elements.homeGigSearchInput && elements.homeGigSearchInput.value !== gigSearchQuery) {
    elements.homeGigSearchInput.value = gigSearchQuery;
  }
  if (elements.gigDiarySearchRow) {
    elements.gigDiarySearchRow.classList.toggle("hidden", Boolean(gigDiaryDateFilter));
  }
  if (elements.gigDiaryTitle) {
    elements.gigDiaryTitle.textContent = gigDiaryDateFilter
      ? `Nastupi za ${formatFullDate(gigDiaryDateFilter)}`
      : "Pregled svih nastupa";
  }

  if (!state.gigs.length) {
    activeGigDiaryId = null;
    elements.gigDiaryList.className = "diary-list empty-state";
    elements.gigDiaryList.textContent = "Jos nema upisanih nastupa.";
    elements.gigDiaryDetail.className = "diary-detail empty-state";
    elements.gigDiaryDetail.textContent = "Odaberi nastup za detalje.";
    return;
  }

  const visibleGigs = getFilteredGigs();
  if (!visibleGigs.length) {
    activeGigDiaryId = null;
    elements.gigDiaryList.className = "diary-list empty-state";
    elements.gigDiaryList.textContent = gigDiaryDateFilter
      ? "Nema nastupa za odabrani dan."
      : "Nema nastupa koji odgovaraju ovoj pretrazi.";
    elements.gigDiaryDetail.className = "diary-detail empty-state";
    elements.gigDiaryDetail.textContent = gigDiaryDateFilter
      ? "Za ovaj dan nema drugih događaja."
      : "Promijeni pojam pretrage za prikaz detalja.";
    return;
  }

  const hasActiveGig = visibleGigs.some((gig) => gig.id === activeGigDiaryId);
  if (!hasActiveGig) {
    activeGigDiaryId = visibleGigs[0].id;
  }

  elements.gigDiaryList.className = "diary-list";
  elements.gigDiaryList.innerHTML = visibleGigs.map((gig) => `
    <button type="button" class="diary-list-item ${gig.id === activeGigDiaryId ? "active" : ""}" data-diary-gig="${gig.id}">
      <strong>${escapeHtml(gig.bandName)}</strong>
      <span>${formatFullDate(gig.date)}${gig.time ? ` u ${gig.time}` : ""}</span>
      <span>${escapeHtml(gig.location)}</span>
    </button>
  `).join("");

  const activeGig = visibleGigs.find((gig) => gig.id === activeGigDiaryId);
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
        <div class="card-actions">
          <button type="button" class="primary-button small-button" data-diary-edit="${activeGig.id}">Uredi nastup</button>
          <button type="button" class="danger-button small-button" data-delete-gig="${activeGig.id}">Obrisi dogadaj</button>
        </div>
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

function openGigDiaryModal(gigId = null, options = {}) {
  gigDiaryDateFilter = options.dateFilter || "";
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
  gigDiaryDateFilter = "";
}

function setActiveGigDiary(gigId) {
  activeGigDiaryId = gigId;
  renderGigDiary();
}

function handleGigSearchInput(event) {
  gigSearchQuery = event.target.value.trim();
  if (elements.gigSearchInput && event.target !== elements.gigSearchInput) {
    elements.gigSearchInput.value = gigSearchQuery;
  }
  if (elements.homeGigSearchInput && event.target !== elements.homeGigSearchInput) {
    elements.homeGigSearchInput.value = gigSearchQuery;
  }
  renderHomeGigSearchResults();
  renderGigDiary();
}

function getFilteredGigs() {
  const gigsByDate = gigDiaryDateFilter
    ? state.gigs.filter((gig) => gig.date === gigDiaryDateFilter)
    : state.gigs;

  if (gigDiaryDateFilter) {
    return gigsByDate;
  }

  const normalizedQuery = gigSearchQuery.trim().toLocaleLowerCase("hr");
  if (!normalizedQuery) {
    return gigsByDate;
  }

  return gigsByDate.filter((gig) => {
    const searchable = [
      gig.bandName,
      gig.location,
      gig.contractor,
      gig.contactPhone,
      gig.contactEmail,
      gig.notes,
      gig.paymentMethod,
      gig.date,
      formatFullDate(gig.date),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("hr");

    return searchable.includes(normalizedQuery);
  });
}

function renderHomeGigSearchResults() {
  if (!elements.homeGigSearchResults) {
    return;
  }

  if (!state.gigs.length) {
    elements.homeGigSearchResults.className = "home-gig-results empty-state";
    elements.homeGigSearchResults.textContent = "Jos nema upisanih nastupa.";
    return;
  }

  if (!gigSearchQuery.trim()) {
    elements.homeGigSearchResults.className = "home-gig-results empty-state";
    elements.homeGigSearchResults.textContent = "Upisi pojam za pretragu nastupa.";
    return;
  }

  const visibleGigs = getFilteredGigs();
  if (!visibleGigs.length) {
    elements.homeGigSearchResults.className = "home-gig-results empty-state";
    elements.homeGigSearchResults.textContent = "Nema nastupa koji odgovaraju ovoj pretrazi.";
    return;
  }

  elements.homeGigSearchResults.className = "home-gig-results";
  elements.homeGigSearchResults.innerHTML = visibleGigs.slice(0, 6).map((gig) => `
    <button type="button" class="home-gig-result" data-home-search-gig="${gig.id}">
      <strong>${escapeHtml(gig.bandName)}</strong>
      <span>${formatFullDate(gig.date)}${gig.time ? ` u ${gig.time}` : ""}</span>
      <span>${escapeHtml(gig.location)}</span>
    </button>
  `).join("");
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

function syncAdvanceReceiptAvailability() {
  if (!elements.gigPrintReceiptButton) {
    return;
  }

  const hasAdvance = toAmount(elements.gigAdvance?.value) > 0;
  elements.gigPrintReceiptButton.disabled = !hasAdvance;
}

function buildGigFromForm() {
  return normalizeGig({
    id: elements.gigId.value || "",
    bandName: elements.bandName.value.trim(),
    date: elements.gigDate.value,
    time: document.getElementById("gigTime").value,
    location: document.getElementById("gigLocation").value.trim(),
    contractor: document.getElementById("contractorName").value.trim(),
    contactPhone: document.getElementById("contactPhone").value.trim(),
    contactEmail: document.getElementById("contactEmail").value.trim(),
    fee: toAmount(document.getElementById("gigFee").value),
    advance: toAmount(elements.gigAdvance.value),
    paymentMethod: document.getElementById("paymentMethod").value,
    netEarning: getGigNetEarningValue(),
    notes: document.getElementById("gigNotes").value.trim(),
  });
}

function openAdvanceReceiptPrint(gig) {
  const recipientName = [state.user?.firstName, state.user?.lastName].filter(Boolean).join(" ").trim() || state.user?.email || "Primatelj";
  const title = `Potvrda avansa - ${gig.bandName || "Nastup"}`;
  const issueDate = new Date().toLocaleDateString("hr-HR");
  const eventDate = gig.date ? formatFullDate(gig.date) : "-";
  const eventTime = gig.time || "-";
  const notesBlock = gig.notes ? `<div class="notes"><strong>Napomena:</strong><p>${escapeHtml(gig.notes)}</p></div>` : "";
  const logoUrl = `${window.location.origin}/logo_trans.png`;
  const receiptMarkup = `<!DOCTYPE html>
<html lang="hr">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #14213d;
      background: #ffffff;
    }
    .sheet {
      position: relative;
      display: flex;
      flex-direction: column;
      width: 100%;
      min-height: 271mm;
      border: 1px solid #d6dde8;
      padding: 12mm 11mm 18mm;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 8mm;
    }
    .brand {
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #7c889f;
      margin: 0 0 6px;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      line-height: 1.15;
    }
    .meta {
      text-align: right;
      font-size: 13px;
      line-height: 1.5;
    }
    .amount-card {
      margin: 0 0 8mm;
      padding: 8mm;
      border-radius: 14px;
      background: #f5f7fb;
      border: 1px solid #dfe6f1;
    }
    .amount-label {
      margin: 0 0 8px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #7c889f;
    }
    .amount-value {
      margin: 0;
      font-size: 30px;
      font-weight: 700;
      color: #c56d48;
    }
    .lead {
      margin: 0 0 8mm;
      font-size: 15px;
      line-height: 1.55;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5mm 6mm;
      margin-bottom: 8mm;
    }
    .item {
      padding-bottom: 4mm;
      border-bottom: 1px solid #e3e8f0;
      break-inside: avoid;
    }
    .item span {
      display: block;
      margin-bottom: 6px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #7c889f;
    }
    .item strong {
      font-size: 15px;
      line-height: 1.35;
    }
    .notes {
      margin-top: 5mm;
      padding: 6mm;
      border-radius: 12px;
      background: #fafbfd;
      border: 1px solid #e3e8f0;
      break-inside: avoid;
    }
    .notes strong {
      display: block;
      margin-bottom: 6px;
    }
    .notes p {
      margin: 0;
      line-height: 1.45;
      white-space: pre-wrap;
    }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8mm;
      margin-top: 12mm;
      break-inside: avoid;
    }
    .signature-line {
      padding-top: 10mm;
      border-top: 1px solid #9aa7bd;
      font-size: 13px;
    }
    .powered-by {
      position: absolute;
      right: 11mm;
      bottom: 6mm;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 3mm;
      break-inside: avoid;
    }
    .powered-by span {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #7c889f;
      opacity: 0.78;
    }
    .powered-by img {
      width: 92px;
      height: auto;
      display: block;
      object-fit: contain;
      opacity: 0.5;
    }
    @media print {
      .sheet {
        border: 0;
        min-height: 271mm;
        padding: 0;
      }
      .powered-by {
        right: 4mm;
        bottom: 3mm;
      }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <header class="header">
      <div>
        <p class="brand">Gazza Manager</p>
        <h1>Potvrda o primljenom avansu</h1>
      </div>
      <div class="meta">
        <div>Datum potvrde: <strong>${escapeHtml(issueDate)}</strong></div>
        <div>Nacin placanja: <strong>${escapeHtml(gig.paymentMethod || "-")}</strong></div>
      </div>
    </header>

    <section class="amount-card">
      <p class="amount-label">Primljeni iznos avansa</p>
      <p class="amount-value">${escapeHtml(formatCurrency(gig.advance))}</p>
    </section>

    <p class="lead">
      Ovom potvrdom potvrduje se da je za nastup <strong>${escapeHtml(gig.bandName || "-")}</strong>
      zaprimljen avans od ugovaratelja <strong>${escapeHtml(gig.contractor || "-")}</strong>.
    </p>

    <section class="grid">
      <div class="item">
        <span>Primatelj avansa</span>
        <strong>${escapeHtml(recipientName)}</strong>
      </div>
      <div class="item">
        <span>Ugovaratelj</span>
        <strong>${escapeHtml(gig.contractor || "-")}</strong>
      </div>
      <div class="item">
        <span>Datum nastupa</span>
        <strong>${escapeHtml(eventDate)}</strong>
      </div>
      <div class="item">
        <span>Vrijeme nastupa</span>
        <strong>${escapeHtml(eventTime)}</strong>
      </div>
      <div class="item">
        <span>Lokacija nastupa</span>
        <strong>${escapeHtml(gig.location || "-")}</strong>
      </div>
      <div class="item">
        <span>Dogovorena cijena</span>
        <strong>${escapeHtml(formatCurrency(gig.fee))}</strong>
      </div>
    </section>

    ${notesBlock}

    <section class="signatures">
      <div class="signature-line">Potpis primatelja</div>
      <div class="signature-line">Potpis ugovaratelja</div>
    </section>

    <div class="powered-by">
      <span>Powered By:</span>
      <img src="${escapeAttribute(logoUrl)}" alt="Gazza logo">
    </div>
  </main>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";

  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 500);
  };

  iframe.addEventListener("load", () => {
    const printWindow = iframe.contentWindow;
    if (!printWindow) {
      cleanup();
      window.alert("Potvrdu nije moguce pripremiti za ispis.");
      return;
    }

    const frameDocument = iframe.contentDocument;
    const logoImage = frameDocument?.querySelector(".powered-by img");
    const triggerPrint = () => {
      printWindow.focus();
      printWindow.addEventListener("afterprint", cleanup, { once: true });
      window.setTimeout(() => {
        try {
          printWindow.print();
        } catch {
          cleanup();
        }
      }, 150);
    };

    if (logoImage && !logoImage.complete) {
      logoImage.addEventListener("load", triggerPrint, { once: true });
      logoImage.addEventListener("error", triggerPrint, { once: true });
      return;
    }

    triggerPrint();
  }, { once: true });

  document.body.appendChild(iframe);

  const frameDocument = iframe.contentDocument;
  if (!frameDocument) {
    cleanup();
    window.alert("Potvrdu nije moguce pripremiti za ispis.");
    return;
  }

  frameDocument.open();
  frameDocument.write(receiptMarkup);
  frameDocument.close();
}

function openCalendarBackupPrint(gigs = []) {
  const ownerName = [state.user?.firstName, state.user?.lastName].filter(Boolean).join(" ").trim() || state.user?.email || "Korisnik";
  const issueDate = new Date().toLocaleDateString("hr-HR");
  const logoUrl = `${window.location.origin}/logo_trans.png`;
  const backupGigs = Array.isArray(gigs) ? gigs : [];
  const groupedGigs = backupGigs
    .slice()
    .sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`))
    .reduce((groups, gig) => {
      const existing = groups.get(gig.date) || [];
      existing.push(gig);
      groups.set(gig.date, existing);
      return groups;
    }, new Map());

  const summary = {
    totalGigs: backupGigs.length,
    totalAdvance: sum(backupGigs.map((gig) => gig.advance)),
    totalRevenue: sum(backupGigs.filter((gig) => gig.netEarning != null).map((gig) => gig.netEarning)),
  };

  const allGigsListMarkup = backupGigs.length
    ? `
        <section class="overview-section">
          <div class="section-title">
            <h2>Popis svih nastupa</h2>
            <span>1 red = 1 događaj</span>
          </div>
          <div class="overview-table">
            <div class="overview-row overview-row-header">
              <span>Datum</span>
              <span>Vrijeme</span>
              <span>Bend / događaj</span>
              <span>Lokacija</span>
              <span>Ugovaratelj</span>
              <span>Zarada</span>
            </div>
            ${backupGigs.map((gig) => `
              <div class="overview-row">
                <strong>${escapeHtml(formatFullDate(gig.date))}</strong>
                <span>${escapeHtml(gig.time || "-")}</span>
                <span>${escapeHtml(gig.bandName || "Nastup")}</span>
                <span>${escapeHtml(gig.location || "-")}</span>
                <span>${escapeHtml(gig.contractor || "-")}</span>
                <span>${gig.netEarning == null ? "Čeka unos" : escapeHtml(formatCurrency(gig.netEarning))}</span>
              </div>
            `).join("")}
          </div>
        </section>
      `
    : "";

  const groupsMarkup = groupedGigs.size
    ? [...groupedGigs.entries()].map(([date, gigs]) => `
        <section class="day-group">
          <div class="day-header">
            <h2>${escapeHtml(formatFullDate(date))}</h2>
            <span>${gigs.length} događaja</span>
          </div>
          <div class="event-list">
            ${gigs.map((gig) => `
              <article class="event-card">
                <div class="event-top">
                  <strong>${escapeHtml(gig.bandName || "Nastup")}</strong>
                  <span>${escapeHtml(gig.time || "Bez vremena")}</span>
                </div>
                <div class="event-grid">
                  <div><span>Lokacija</span><strong>${escapeHtml(gig.location || "-")}</strong></div>
                  <div><span>Ugovaratelj</span><strong>${escapeHtml(gig.contractor || "-")}</strong></div>
                  <div><span>Kontakt telefon</span><strong>${escapeHtml(gig.contactPhone || "-")}</strong></div>
                  <div><span>Kontakt email</span><strong>${escapeHtml(gig.contactEmail || "-")}</strong></div>
                  <div><span>Dogovorena cijena</span><strong>${formatCurrency(gig.fee)}</strong></div>
                  <div><span>Avans</span><strong>${formatCurrency(gig.advance)}</strong></div>
                  <div><span>Način plaćanja</span><strong>${escapeHtml(gig.paymentMethod || "-")}</strong></div>
                  <div><span>Točna zarada</span><strong>${gig.netEarning == null ? "Čeka unos" : formatCurrency(gig.netEarning)}</strong></div>
                </div>
                ${gig.notes ? `<p class="notes"><strong>Napomena:</strong> ${escapeHtml(gig.notes)}</p>` : ""}
              </article>
            `).join("")}
          </div>
        </section>
      `).join("")
    : `<section class="empty"><p>Još nema upisanih događaja za backup.</p></section>`;

  const backupMarkup = `<!DOCTYPE html>
<html lang="hr">
<head>
  <meta charset="UTF-8">
  <title>Gazza backup podataka</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      color: #111827;
      background: #ffffff;
    }
    .sheet {
      position: relative;
      min-height: 271mm;
      padding: 6mm 2mm 12mm;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 8mm;
    }
    .brand img {
      width: 180px;
      height: auto;
      display: block;
      margin-bottom: 10px;
    }
    .brand p,
    .meta,
    .summary-card span,
    .event-grid span,
    .day-header span {
      color: #667085;
    }
    .brand p {
      margin: 0;
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .meta {
      text-align: right;
      font-size: 13px;
      line-height: 1.6;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 8mm;
    }
    .summary-card {
      padding: 14px 16px;
      border: 1px solid #d8dfeb;
      border-radius: 14px;
      background: #f8faff;
    }
    .summary-card strong {
      display: block;
      margin-top: 6px;
      font-size: 20px;
      color: #0f172a;
    }
    .overview-section {
      margin-bottom: 10mm;
    }
    .section-title {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #d8dfeb;
    }
    .section-title h2 {
      margin: 0;
      font-size: 20px;
      color: #0f172a;
    }
    .section-title span {
      color: #667085;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .overview-table {
      display: grid;
      gap: 6px;
      margin-bottom: 2mm;
    }
    .overview-row {
      display: grid;
      grid-template-columns: 1.15fr 0.6fr 1.2fr 1.2fr 1.1fr 0.9fr;
      gap: 10px;
      align-items: start;
      padding: 9px 10px;
      border: 1px solid #e5eaf2;
      border-radius: 10px;
      background: #ffffff;
      font-size: 12px;
      line-height: 1.4;
      break-inside: avoid;
    }
    .overview-row-header {
      background: #f8faff;
      font-weight: 700;
      color: #667085;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-size: 11px;
    }
    .overview-row strong {
      color: #0f172a;
      font-size: 12px;
    }
    .day-group {
      margin-bottom: 7mm;
      break-inside: avoid;
    }
    .day-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #d8dfeb;
    }
    .day-header h2 {
      margin: 0;
      font-size: 20px;
      color: #0f172a;
    }
    .event-list {
      display: grid;
      gap: 10px;
    }
    .event-card {
      padding: 14px 16px;
      border: 1px solid #d8dfeb;
      border-radius: 14px;
      background: #ffffff;
      break-inside: avoid;
    }
    .event-top {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
      font-size: 15px;
    }
    .event-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 14px;
    }
    .event-grid div {
      padding: 8px 0;
      border-bottom: 1px solid #eef2f7;
    }
    .event-grid span {
      display: block;
      margin-bottom: 4px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .event-grid strong {
      font-size: 14px;
      color: #0f172a;
    }
    .notes {
      margin: 12px 0 0;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .empty {
      padding: 18px;
      border: 1px dashed #c9d4e5;
      border-radius: 14px;
      color: #667085;
    }
    @media print {
      .sheet {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <header class="header">
      <div class="brand">
        <img src="${escapeAttribute(logoUrl)}" alt="Gazza logo">
        <p>Backup svih podataka</p>
      </div>
      <div class="meta">
        <div>Datum izrade: <strong>${escapeHtml(issueDate)}</strong></div>
        <div>Korisnik: <strong>${escapeHtml(ownerName)}</strong></div>
      </div>
    </header>
    <section class="summary">
      <article class="summary-card">
        <span>Ukupno događaja</span>
        <strong>${escapeHtml(String(summary.totalGigs))}</strong>
      </article>
      <article class="summary-card">
        <span>Ukupno avansa</span>
        <strong>${escapeHtml(formatCurrency(summary.totalAdvance))}</strong>
      </article>
      <article class="summary-card">
        <span>Ukupna zarada</span>
        <strong>${escapeHtml(formatCurrency(summary.totalRevenue))}</strong>
      </article>
    </section>
    ${allGigsListMarkup}
    ${groupsMarkup}
  </main>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";

  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 500);
  };

  iframe.addEventListener("load", () => {
    const printWindow = iframe.contentWindow;
    if (!printWindow) {
      cleanup();
      window.alert("Backup PDF nije moguce pripremiti.");
      return;
    }

    const frameDocument = iframe.contentDocument;
    const logoImage = frameDocument?.querySelector(".brand img");
    const triggerPrint = () => {
      printWindow.focus();
      printWindow.addEventListener("afterprint", cleanup, { once: true });
      window.setTimeout(() => {
        try {
          printWindow.print();
        } catch {
          cleanup();
        }
      }, 150);
    };

    if (logoImage && !logoImage.complete) {
      logoImage.addEventListener("load", triggerPrint, { once: true });
      logoImage.addEventListener("error", triggerPrint, { once: true });
      return;
    }

    triggerPrint();
  }, { once: true });

  document.body.appendChild(iframe);

  const frameDocument = iframe.contentDocument;
  if (!frameDocument) {
    iframe.remove();
    throw new Error("Backup dokument nije moguce otvoriti.");
  }

  frameDocument.open();
  frameDocument.write(backupMarkup);
  frameDocument.close();
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

function formatDateShort(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("hr-HR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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

function compareGigsByMostRecent(a, b) {
  const dateDiff = parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime();
  if (dateDiff !== 0) {
    return dateDiff;
  }

  return String(b.time || "").localeCompare(String(a.time || ""), "hr");
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
    const error = new Error(payload?.error || "Zahtjev nije uspio.");
    error.statusCode = response.status;
    if (payload?.billing) {
      error.billing = payload.billing;
    }
    if (response.status === 402) {
      if (payload?.billing) {
        state.billing = payload.billing;
        if (state.user) {
          state.user.billing = payload.billing;
        }
      }
      licenseUiState.loading = false;
      licenseUiState.error = error.message;
      if (state.user) {
        renderPaywall();
      }
    }
    throw error;
  }
  return payload;
}

window.googleIdentityLoaded = function googleIdentityLoaded() {
  googleCalendarRuntime.ready = true;
  renderGoogleCalendarControls();
};
