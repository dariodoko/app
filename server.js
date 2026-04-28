const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let nodemailer = null;
try {
  // Optional dependency: app still runs without SMTP configured.
  nodemailer = require("nodemailer");
} catch (error) {
  nodemailer = null;
}

let Stripe = null;
try {
  // Optional dependency: billing UI still works without Stripe setup.
  Stripe = require("stripe");
} catch (error) {
  Stripe = null;
}

loadEnvFile();

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const APP_URL = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || "";
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || "Gazza Manager";
const TRIAL_DAYS = Number.parseInt(process.env.TRIAL_DAYS || "7", 10);
const BILLING_CURRENCY = (process.env.BILLING_CURRENCY || "eur").toLowerCase();
const BILLING_PRICE_LABEL = process.env.BILLING_PRICE_LABEL || "25,00 EUR / 1 godina";
const LICENSE_DURATION_DAYS = Number.parseInt(process.env.LICENSE_DURATION_DAYS || "365", 10);
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const SESSION_COOKIE = "glazbeni_dnevnik_session";
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "app-data.json");
const PUBLIC_FILES = new Set([
  "/index.html",
  "/style.css",
  "/app.js",
  "/license-service.js",
  "/logo.jpg",
  "/logo.png",
  "/logo_trans.png",
  "/ikona_bijela_transparent.png",
  "/ikona_plava_transparent.png",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
  "/service-worker.js",
]);
let mailTransporter = null;
let stripeClient = null;

fs.mkdirSync(DATA_DIR, { recursive: true });
ensureDataFile();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const cookies = parseCookies(request.headers.cookie || "");
    const session = await getSession(cookies[SESSION_COOKIE]);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === "/api/stripe/webhook" && request.method === "POST") {
      const rawBody = await readRawBody(request);
      return handleStripeWebhook(request, response, rawBody);
    }

    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      const body = await readJsonBody(request);
      return handleRegister(response, body);
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const body = await readJsonBody(request);
      return handleLogin(response, body);
    }

    if (url.pathname === "/api/auth/forgot-password" && request.method === "POST") {
      const body = await readJsonBody(request);
      return handleForgotPassword(response, body);
    }

    if (url.pathname === "/api/auth/reset-password" && request.method === "POST") {
      const body = await readJsonBody(request);
      return handleResetPassword(response, body);
    }

    if (url.pathname === "/api/public/billing/checkout-session" && request.method === "POST") {
      const body = await readJsonBody(request);
      return handlePublicCheckoutSession(request, response, body);
    }

    if (url.pathname === "/api/auth/complete-registration-checkout" && request.method === "POST") {
      const body = await readJsonBody(request);
      return handleCompleteRegistrationCheckout(request, response, body);
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      await clearSession(cookies[SESSION_COOKIE]);
      if (session?.userId) {
        await clearUserSessions(session.userId);
      }
      response.setHeader("Set-Cookie", buildExpiredSessionCookies());
      return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      if (!session) {
        return sendJson(response, 200, { user: null });
      }

      const user = await getUserById(session.userId);
      return sendJson(response, 200, { user: user ? serializeUser(user) : null });
    }

    if (url.pathname === "/api/mail-status" && request.method === "GET") {
      return sendJson(response, 200, await getMailStatus());
    }

    if (!session) {
      if (url.pathname.startsWith("/api/")) {
        return sendJson(response, 401, { error: "Prijava je obavezna." });
      }

      if (request.method === "GET") {
        return serveStatic(url.pathname, response);
      }

      return sendJson(response, 401, { error: "Prijava je obavezna." });
    }

    const sessionUser = await getUserById(session.userId);
    if (!sessionUser) {
      await clearSession(cookies[SESSION_COOKIE]);
      response.setHeader("Set-Cookie", buildExpiredSessionCookies());
      return sendJson(response, 401, { error: "Korisnicka sesija vise nije valjana." });
    }

    if (url.pathname === "/api/billing/status" && request.method === "GET") {
      return sendJson(response, 200, buildBillingState(sessionUser));
    }

    if (url.pathname === "/api/billing/checkout-session" && request.method === "POST") {
      return handleCreateCheckoutSession(request, response, sessionUser);
    }

    if (url.pathname === "/api/billing/restore" && request.method === "POST") {
      return sendJson(response, 200, await handleRestorePurchases(sessionUser));
    }

    if (!hasUserAccess(sessionUser)) {
      if (url.pathname.startsWith("/api/")) {
        return sendJson(response, 402, {
          error: "Licenca nije aktivna. Kupi ili obnovi licencu za nastavak rada.",
          billing: buildBillingState(sessionUser),
        });
      }

      if (request.method === "GET") {
        return serveStatic(url.pathname, response);
      }

      return sendJson(response, 402, {
        error: "Licenca nije aktivna. Kupi ili obnovi licencu za nastavak rada.",
        billing: buildBillingState(sessionUser),
      });
    }

    if (url.pathname === "/api/bootstrap" && request.method === "GET") {
      return sendJson(response, 200, await buildBootstrapState(sessionUser.id));
    }

    if (url.pathname === "/api/settings" && request.method === "GET") {
      return sendJson(response, 200, await getSettings(sessionUser.id));
    }

    if (url.pathname === "/api/settings" && request.method === "PUT") {
      const body = await readJsonBody(request);
      await saveSettings(sessionUser.id, body);
      return sendJson(response, 200, await getSettings(sessionUser.id));
    }

    if (url.pathname === "/api/mail-test" && request.method === "POST") {
      const sent = await sendTestEmail(sessionUser);
      return sendJson(response, 200, {
        ok: sent,
        message: sent
          ? `Testni email poslan na ${sessionUser?.email || "korisnika"}.`
          : "Testni email nije poslan. Provjeri SMTP postavke i server log.",
      });
    }

    if (url.pathname === "/api/profile" && (request.method === "PUT" || request.method === "POST")) {
      const body = await readJsonBody(request);
      return sendJson(response, 200, { user: await updateUserProfile(sessionUser.id, body) });
    }

    if (url.pathname === "/api/profile/password" && request.method === "POST") {
      const body = await readJsonBody(request);
      return handleProfilePasswordChange(response, sessionUser.id, body);
    }

    if (url.pathname === "/api/profile" && request.method === "DELETE") {
      await deleteUserAccount(sessionUser.id);
      response.setHeader("Set-Cookie", buildExpiredSessionCookie(isSecureRequest(request)));
      return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === "/api/bands" && request.method === "GET") {
      return sendJson(response, 200, await listBands(sessionUser.id));
    }

    if (url.pathname === "/api/band-directory" && request.method === "GET") {
      return sendJson(response, 200, await listBandDirectory());
    }

    if (url.pathname === "/api/bands" && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, 201, await createBand(sessionUser.id, body));
    }

    if (url.pathname.startsWith("/api/bands/") && request.method === "PUT") {
      const bandId = getIdFromPath(url.pathname);
      const body = await readJsonBody(request);
      return sendJson(response, 200, await updateBand(sessionUser.id, bandId, body));
    }

    if (url.pathname.startsWith("/api/bands/") && request.method === "DELETE") {
      const bandId = getIdFromPath(url.pathname);
      await deleteBand(sessionUser.id, bandId);
      return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === "/api/gigs" && request.method === "GET") {
      return sendJson(response, 200, await listGigs(sessionUser.id));
    }

    if (url.pathname === "/api/gigs" && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, 201, await createGig(sessionUser.id, body));
    }

    if (url.pathname === "/api/google-calendar/import" && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, 200, await importGoogleCalendarGigs(sessionUser.id, body));
    }

    if (url.pathname.startsWith("/api/gigs/") && request.method === "PUT") {
      const gigId = getIdFromPath(url.pathname);
      const body = await readJsonBody(request);
      return sendJson(response, 200, await updateGig(sessionUser.id, gigId, body));
    }

    if (url.pathname.startsWith("/api/gigs/") && request.method === "DELETE") {
      const gigId = getIdFromPath(url.pathname);
      await deleteGig(sessionUser.id, gigId);
      return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === "/api/gigs/clear" && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, 200, await clearAllGigs(sessionUser.id, body));
    }

    if (url.pathname === "/api/equipment" && request.method === "GET") {
      return sendJson(response, 200, await listEquipment(sessionUser.id));
    }

    if (url.pathname === "/api/equipment" && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, 201, await createEquipment(sessionUser.id, body));
    }

    if (url.pathname.startsWith("/api/equipment/") && request.method === "PUT") {
      const equipmentId = getIdFromPath(url.pathname);
      const body = await readJsonBody(request);
      return sendJson(response, 200, await updateEquipment(sessionUser.id, equipmentId, body));
    }

    if (url.pathname.startsWith("/api/equipment/") && request.method === "DELETE") {
      const equipmentId = getIdFromPath(url.pathname);
      await deleteEquipment(sessionUser.id, equipmentId);
      return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === "/api/demo/seed" && request.method === "POST") {
      return sendJson(response, 200, await seedDemoData(sessionUser.id));
    }

    if (request.method === "GET") {
      return serveStatic(url.pathname, response);
    }

    return sendJson(response, 404, { error: "Ruta nije pronadena." });
  } catch (error) {
    console.error(error);
    return sendJson(response, error.statusCode || 500, { error: error.message || "Dogodila se greska na serveru." });
  }
});

server.listen(PORT, HOST, async () => {
  const removedImportedBandCount = await cleanupImportedGoogleBands();
  if (removedImportedBandCount > 0) {
    console.log(`Uklonjeno ${removedImportedBandCount} neispravnih ili Google-import bend unosa.`);
  }

  console.log(`Glazbeni dnevnik backend radi na http://${HOST}:${PORT}`);
});

async function handleRegister(response, body) {
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const firstName = asString(body.firstName);
  const lastName = asString(body.lastName);
  const phone = asString(body.phone);
  const primaryBand = asString(body.primaryBand);
  const primaryInstrument = asString(body.primaryInstrument);

  if (!email || !password || !firstName || !lastName || !phone) {
    throw createHttpError(400, "Email, ime, prezime, broj mobitela i lozinka su obavezni.");
  }

  if (!isPasswordStrongEnough(password)) {
    throw createHttpError(400, "Lozinka mora imati najmanje 8 znakova i barem jedan broj.");
  }

  const data = await readData();
  const existing = data.users.find((user) => user.email === email);
  if (existing) {
    if (!isPlaceholderUser(existing)) {
      throw createHttpError(409, "Korisnik s tim emailom vec postoji.");
    }

    const completedUser = await completePlaceholderRegistration(existing.id, {
      email,
      password,
      firstName,
      lastName,
      phone,
      primaryBand,
      primaryInstrument,
    });
    const registrationEmailResult = await sendRegistrationWelcomeEmail(completedUser);
    const sessionId = await createSession(existing.id);
    response.setHeader("Set-Cookie", buildSessionCookie(sessionId, isSecureRequest(response.req)));
    return sendJson(response, 201, {
      user: serializeUser(completedUser),
      registrationEmailSent: registrationEmailResult.sent,
      registrationEmailError: registrationEmailResult.error,
    });
  }

  const userId = await createRegisteredUser({
    email,
    password,
    firstName,
    lastName,
    phone,
    primaryBand,
    primaryInstrument,
  });
  const createdUser = await getUserById(userId);
  const registrationEmailResult = await sendRegistrationWelcomeEmail(createdUser);
  const sessionId = await createSession(userId);
  response.setHeader("Set-Cookie", buildSessionCookie(sessionId, isSecureRequest(response.req)));
  return sendJson(response, 201, {
    user: serializeUser(createdUser),
    registrationEmailSent: registrationEmailResult.sent,
    registrationEmailError: registrationEmailResult.error,
  });
}

async function handleCompleteRegistrationCheckout(request, response, body) {
  const checkoutSessionId = asString(body.checkoutSessionId);
  if (!checkoutSessionId) {
    throw createHttpError(400, "Checkout session nije dostupan.");
  }

  const stripe = getStripeClient();
  if (!stripe) {
    throw createHttpError(503, "Stripe nije konfiguriran.");
  }

  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
  if (!session || session.mode !== "payment" || session.payment_status !== "paid") {
    throw createHttpError(400, "Uplata za checkout session jos nije potvrdena.");
  }

  const userId = asString(session.metadata?.userId || session.client_reference_id);
  const email = normalizeEmail(session.metadata?.email);
  const pendingRegistration = await consumePendingRegistration(userId, email);
  if (!pendingRegistration) {
    const existingUser = await findUserByEmail(email);
    if (!existingUser || isPlaceholderUser(existingUser)) {
      throw createHttpError(400, "Registracija za ovu uplatu nije pronadena.");
    }

    const sessionId = await createSession(existingUser.id);
    response.setHeader("Set-Cookie", buildSessionCookie(sessionId, isSecureRequest(request)));
    return sendJson(response, 200, { user: serializeUser(existingUser) });
  }

  const existingUser = await getUserById(pendingRegistration.userId);
  if (!existingUser) {
    throw createHttpError(404, "Korisnik za ovu uplatu nije pronaden.");
  }

  const completedUser = isPlaceholderUser(existingUser)
    ? await completePlaceholderRegistration(existingUser.id, pendingRegistration)
    : existingUser;
  const registrationEmailResult = await sendRegistrationWelcomeEmail(completedUser);
  const sessionId = await createSession(completedUser.id);
  response.setHeader("Set-Cookie", buildSessionCookie(sessionId, isSecureRequest(request)));
  return sendJson(response, 200, {
    user: serializeUser(completedUser),
    registrationEmailSent: registrationEmailResult.sent,
    registrationEmailError: registrationEmailResult.error,
  });
}

async function handleLogin(response, body) {
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const data = await readData();
  const user = data.users.find((item) => item.email === email);

  if (!user || isPlaceholderUser(user)) {
    throw createHttpError(401, "Mail adresa ne postoji. Nastavite na registraciju.");
  }

  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    throw createHttpError(401, "Unesena je kriva lozinka");
  }

  const sessionId = await createSession(user.id);
  response.setHeader("Set-Cookie", buildSessionCookie(sessionId, isSecureRequest(response.req)));
  return sendJson(response, 200, { user: serializeUser(user) });
}

async function handleForgotPassword(response, body) {
  const email = normalizeEmail(body.email);
  if (!email) {
    throw createHttpError(400, "Unesite email adresu.");
  }

  const data = await readData();
  const user = data.users.find((item) => item.email === email);

  if (user) {
    const resetToken = await createPasswordResetToken(user.id);
    await sendPasswordResetEmail(user, resetToken);
  }

  return sendJson(response, 200, {
    ok: true,
    message: "Ako racun postoji, poslali smo link za postavljanje nove lozinke.",
  });
}

async function handleResetPassword(response, body) {
  const token = asString(body.token);
  const password = typeof body.password === "string" ? body.password : "";

  if (!token) {
    throw createHttpError(400, "Link za reset lozinke nije valjan.");
  }

  if (!isPasswordStrongEnough(password)) {
    throw createHttpError(400, "Lozinka mora imati najmanje 8 znakova i barem jedan broj.");
  }

  const reset = await consumePasswordResetToken(token);
  if (!reset) {
    throw createHttpError(400, "Link za reset lozinke je istekao ili nije valjan.");
  }

  const { salt, hash } = hashPassword(password);

  await updateData((data) => {
    const user = data.users.find((item) => item.id === reset.userId);
    if (!user) {
      throw createHttpError(404, "Korisnik nije pronaden.");
    }

    user.passwordSalt = salt;
    user.passwordHash = hash;
    data.sessions = data.sessions.filter((session) => session.userId !== reset.userId);
    data.passwordResets = (data.passwordResets || []).filter((item) => item.userId !== reset.userId);
  });

  return sendJson(response, 200, {
    ok: true,
    message: "Nova lozinka je spremljena. Sad se mozes prijaviti.",
  });
}

async function handleProfilePasswordChange(response, userId, body) {
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword || !newPassword) {
    throw createHttpError(400, "Trenutna i nova lozinka su obavezne.");
  }

  if (!isPasswordStrongEnough(newPassword)) {
    throw createHttpError(400, "Nova lozinka mora imati najmanje 8 znakova i barem jedan broj.");
  }

  const data = await readData();
  const user = data.users.find((item) => item.id === userId);

  if (!user || !verifyPassword(currentPassword, user.passwordSalt, user.passwordHash)) {
    throw createHttpError(401, "Trenutna lozinka nije ispravna.");
  }

  const { salt, hash } = hashPassword(newPassword);

  await updateData((next) => {
    const nextUser = next.users.find((item) => item.id === userId);
    if (!nextUser) {
      throw createHttpError(404, "Korisnik nije pronaden.");
    }

    nextUser.passwordSalt = salt;
    nextUser.passwordHash = hash;
    next.passwordResets = (next.passwordResets || []).filter((item) => item.userId !== userId);
  });

  return sendJson(response, 200, {
    ok: true,
    message: "Lozinka je uspjesno promijenjena.",
  });
}

async function clearAllGigs(userId, body) {
  const password = typeof body.password === "string" ? body.password : "";
  if (!password) {
    throw createHttpError(400, "Lozinka je obavezna za brisanje svih događaja.");
  }

  const data = await readData();
  const user = data.users.find((item) => item.id === userId);

  if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    throw createHttpError(401, "Lozinka nije ispravna.");
  }

  await updateData((next) => {
    next.gigs = (next.gigs || []).filter((gig) => gig.userId !== userId);
  });

  return {
    ok: true,
    message: "Svi događaji su obrisani.",
  };
}

async function createUser(payload) {
  return createRegisteredUser(payload);
}

async function getUserById(userId) {
  const data = await readData();
  return data.users.find((user) => user.id === userId) || null;
}

async function findUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const data = await readData();
  return data.users.find((user) => user.email === normalizedEmail) || null;
}

async function createSession(userId) {
  const id = crypto.randomUUID();

  await updateData((data) => {
    data.sessions.push({
      id,
      userId,
      expiresAt: addDays(30),
      createdAt: nowIso(),
    });
  });

  return id;
}

async function sendRegistrationWelcomeEmail(user) {
  if (!user?.email) {
    return { sent: false, error: "Email korisnika nije dostupan." };
  }

  const transporter = getMailTransporter();
  if (!transporter) {
    return { sent: false, error: "SMTP transporter nije spreman." };
  }

  const firstName = user.firstName || "glazbeniku";
  const loginUrl = getAppUrl();

  try {
    const info = await transporter.sendMail({
      from: formatMailSender(),
      to: user.email,
      subject: "Dobrodosao u Gazza Manager",
      text: [
        `Bok ${firstName},`,
        "",
        "tvoj korisnicki racun je uspjesno kreiran.",
        "Gazza Manager ti pomaze pratiti nastupe, financije i opremu na jednom mjestu.",
        "",
        `Prijava: ${loginUrl}`,
        "",
        "Ako nisi ti kreirao racun, ignoriraj ovu poruku.",
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1c2844;">
          <h2 style="margin-bottom:12px;">Bok ${escapeHtml(firstName)},</h2>
          <p>Tvoj korisnicki racun je uspjesno kreiran.</p>
          <p>Gazza Manager ti pomaze pratiti nastupe, financije i opremu na jednom mjestu.</p>
          <p>
            <a href="${escapeAttribute(loginUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#4e84ff;color:#ffffff;text-decoration:none;font-weight:700;">
              Otvori aplikaciju
            </a>
          </p>
          <p style="color:#6f7b95;">Ako nisi ti kreirao racun, slobodno ignoriraj ovu poruku.</p>
        </div>
      `,
    });

    logMailDeliveryResult("Registracijski email", user.email, info);

    return { sent: true, error: "" };
  } catch (error) {
    logMailDeliveryError("Slanje registracijskog emaila nije uspjelo", user.email, error);
    return { sent: false, error: formatMailError(error) };
  }
}

async function createPlaceholderBillingUser(email) {
  const id = crypto.randomUUID();
  const createdAt = nowIso();

  await updateData((data) => {
    data.users.push({
      id,
      email,
      firstName: "",
      lastName: "",
      address: "",
      phone: "",
      primaryBand: "",
      primaryInstrument: "",
      passwordHash: "",
      passwordSalt: "",
      createdAt,
      trialStartedAt: createdAt,
      trialEndsAt: "",
      subscriptionStatus: "inactive",
      subscriptionPaidAt: "",
      licenseStatus: "inactive",
      licensePaidAt: "",
      licenseExpiresAt: "",
      stripeCustomerId: "",
      stripeSubscriptionId: "",
    });

    data.settings.push({
      userId: id,
      googleCalendarId: "primary",
    });
  });

  return getUserById(id);
}

async function createRegisteredUser(payload) {
  const id = crypto.randomUUID();
  const { salt, hash } = hashPassword(payload.password);
  const createdAt = nowIso();

  await updateData((data) => {
    data.users.push({
      id,
      email: payload.email,
      firstName: asString(payload.firstName),
      lastName: asString(payload.lastName),
      address: asString(payload.address),
      phone: asString(payload.phone),
      primaryBand: asString(payload.primaryBand),
      primaryInstrument: asString(payload.primaryInstrument),
      passwordHash: hash,
      passwordSalt: salt,
      createdAt,
      trialStartedAt: createdAt,
      trialEndsAt: "",
      subscriptionStatus: "inactive",
      subscriptionPaidAt: "",
      licenseStatus: "inactive",
      licensePaidAt: "",
      licenseExpiresAt: "",
      stripeCustomerId: "",
      stripeSubscriptionId: "",
    });

    data.settings.push({
      userId: id,
      googleCalendarId: "primary",
    });
  });

  return id;
}

async function completePlaceholderRegistration(userId, payload) {
  const { salt, hash } = hashPassword(payload.password);

  await updateData((data) => {
    const user = data.users.find((item) => item.id === userId);
    if (!user) {
      throw createHttpError(404, "Korisnik nije pronaden.");
    }

    user.email = payload.email;
    user.firstName = asString(payload.firstName);
    user.lastName = asString(payload.lastName);
    user.phone = asString(payload.phone);
    user.primaryBand = asString(payload.primaryBand);
    user.primaryInstrument = asString(payload.primaryInstrument);
    user.passwordSalt = salt;
    user.passwordHash = hash;
  });

  return getUserById(userId);
}

async function sendPasswordResetEmail(user, token) {
  if (!user?.email) {
    return { sent: false, error: "Email korisnika nije dostupan." };
  }

  const transporter = getMailTransporter();
  if (!transporter) {
    return { sent: false, error: "SMTP transporter nije spreman." };
  }

  const firstName = user.firstName || "glazbeniku";
  const resetUrl = `${getAppUrl()}/?resetToken=${encodeURIComponent(token)}`;

  try {
    const info = await transporter.sendMail({
      from: formatMailSender(),
      to: user.email,
      subject: "Postavi novu lozinku za Gazza Manager",
      text: [
        `Bok ${firstName},`,
        "",
        "zaprimili smo zahtjev za postavljanje nove lozinke.",
        `Klikni na link za nastavak: ${resetUrl}`,
        "",
        "Link vrijedi 60 minuta.",
        "Ako nisi ti zatrazio promjenu lozinke, ignoriraj ovu poruku.",
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1c2844;">
          <h2 style="margin-bottom:12px;">Bok ${escapeHtml(firstName)},</h2>
          <p>Zaprimili smo zahtjev za postavljanje nove lozinke.</p>
          <p>
            <a href="${escapeAttribute(resetUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#4e84ff;color:#ffffff;text-decoration:none;font-weight:700;">
              Postavi novu lozinku
            </a>
          </p>
          <p>Link vrijedi 60 minuta.</p>
          <p style="color:#6f7b95;">Ako nisi ti zatrazio promjenu lozinke, ignoriraj ovu poruku.</p>
        </div>
      `,
    });

    logMailDeliveryResult("Reset lozinke", user.email, info);
    return { sent: true, error: "" };
  } catch (error) {
    logMailDeliveryError("Slanje emaila za reset lozinke nije uspjelo", user.email, error);
    return { sent: false, error: formatMailError(error) };
  }
}

async function sendTestEmail(user) {
  if (!user?.email) {
    return false;
  }

  const transporter = getMailTransporter();
  if (!transporter) {
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: formatMailSender(),
      to: user.email,
      subject: "Gazza Manager SMTP test",
      text: [
        "Ovo je testni email iz Gazza Manager aplikacije.",
        "",
        "Ako si primio ovu poruku, SMTP je ispravno povezan.",
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1c2844;">
          <h2>Gazza Manager SMTP test</h2>
          <p>Ovo je testni email iz Gazza Manager aplikacije.</p>
          <p>Ako si primio ovu poruku, SMTP je ispravno povezan.</p>
        </div>
      `,
    });

    logMailDeliveryResult("Testni email", user.email, info);

    return true;
  } catch (error) {
    logMailDeliveryError("Slanje testnog emaila nije uspjelo", user.email, error);
    return false;
  }
}

function getMailTransporter() {
  if (mailTransporter) {
    return mailTransporter;
  }

  if (!nodemailer || !SMTP_HOST || !SMTP_PORT || !SMTP_FROM) {
    return null;
  }

  const auth = SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined;
  mailTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth,
  });

  return mailTransporter;
}

function formatMailSender() {
  return SMTP_FROM_NAME ? `"${SMTP_FROM_NAME}" <${SMTP_FROM}>` : SMTP_FROM;
}

function getAppUrl() {
  if (APP_URL) {
    return APP_URL;
  }

  return `http://${HOST}:${PORT}`;
}

function logMailDeliveryResult(label, recipient, info) {
  console.log(`${label} prihvacen za ${recipient}.`, {
    messageId: info?.messageId || "",
    accepted: Array.isArray(info?.accepted) ? info.accepted : [],
    rejected: Array.isArray(info?.rejected) ? info.rejected : [],
    response: info?.response || "",
  });
}

function logMailDeliveryError(label, recipient, error) {
  console.error(`${label} za ${recipient}:`, {
    message: error?.message || String(error),
    code: error?.code || "",
    command: error?.command || "",
    response: error?.response || "",
    responseCode: error?.responseCode || "",
  });
}

function formatMailError(error) {
  if (!error) {
    return "Nepoznata SMTP greska.";
  }

  const parts = [
    error.response,
    error.message,
    error.code,
  ].filter(Boolean);

  return parts.length ? parts.join(" | ") : "Nepoznata SMTP greska.";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

async function getMailStatus() {
  const transporter = getMailTransporter();
  const status = {
    nodemailerInstalled: Boolean(nodemailer),
    transporterReady: Boolean(transporter),
    smtpHost: SMTP_HOST || "",
    smtpPort: SMTP_PORT || 0,
    smtpSecure: SMTP_SECURE,
    smtpUserConfigured: Boolean(SMTP_USER),
    smtpPassConfigured: Boolean(SMTP_PASS),
    smtpFrom: SMTP_FROM || "",
    smtpFromName: SMTP_FROM_NAME || "",
    smtpVerified: false,
    smtpVerifyError: "",
  };

  if (!transporter) {
    return status;
  }

  try {
    await transporter.verify();
    status.smtpVerified = true;
  } catch (error) {
    status.smtpVerifyError = error.message || String(error);
  }

  return status;
}

async function getSession(sessionId) {
  if (!sessionId) {
    return null;
  }

  const data = await readData();
  const session = data.sessions.find((item) => item.id === sessionId);
  if (!session) {
    return null;
  }

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await clearSession(sessionId);
    return null;
  }

  return session;
}

async function clearSession(sessionId) {
  if (!sessionId) {
    return;
  }

  await updateData((data) => {
    data.sessions = data.sessions.filter((item) => item.id !== sessionId);
  });
}

async function clearUserSessions(userId) {
  if (!userId) {
    return;
  }

  await updateData((data) => {
    data.sessions = data.sessions.filter((item) => item.userId !== userId);
  });
}

async function createPasswordResetToken(userId) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(rawToken);

  await updateData((data) => {
    data.passwordResets = (data.passwordResets || []).filter((item) => {
      return item.userId !== userId && new Date(item.expiresAt).getTime() > Date.now();
    });

    data.passwordResets.push({
      id: crypto.randomUUID(),
      userId,
      tokenHash,
      expiresAt: addMinutes(60),
      createdAt: nowIso(),
    });
  });

  return rawToken;
}

async function consumePasswordResetToken(token) {
  const tokenHash = hashResetToken(token);
  const data = await readData();
  const reset = (data.passwordResets || []).find((item) => item.tokenHash === tokenHash);

  if (!reset) {
    return null;
  }

  if (new Date(reset.expiresAt).getTime() < Date.now()) {
    await updateData((next) => {
      next.passwordResets = (next.passwordResets || []).filter((item) => item.tokenHash !== tokenHash);
    });
    return null;
  }

  await updateData((next) => {
    next.passwordResets = (next.passwordResets || []).filter((item) => item.tokenHash !== tokenHash);
  });

  return reset;
}

async function buildBootstrapState(userId) {
  return {
    user: serializeUser(await getUserById(userId)),
    settings: await getSettings(userId),
    bands: await listBands(userId),
    bandDirectory: await listBandDirectory(),
    gigs: await listGigs(userId),
    equipment: await listEquipment(userId),
  };
}

async function updateUserProfile(userId, payload) {
  const firstName = asString(payload.firstName);
  const lastName = asString(payload.lastName);
  const address = asString(payload.address);
  const phone = asString(payload.phone);
  const primaryBand = asString(payload.primaryBand);
  const primaryInstrument = asString(payload.primaryInstrument);

  if (!firstName || !lastName || !phone) {
    throw createHttpError(400, "Ime, prezime i broj mobitela su obavezni.");
  }

  await ensureBandExists(userId, primaryBand);

  await updateData((data) => {
    const user = data.users.find((item) => item.id === userId);
    if (!user) {
      throw createHttpError(404, "Korisnik nije pronaden.");
    }

    user.firstName = firstName;
    user.lastName = lastName;
    user.address = address;
    user.phone = phone;
    user.primaryBand = primaryBand;
    user.primaryInstrument = primaryInstrument;
  });

  return serializeUser(await getUserById(userId));
}

async function deleteUserAccount(userId) {
  await updateData((data) => {
    data.users = data.users.filter((user) => user.id !== userId);
    data.sessions = data.sessions.filter((session) => session.userId !== userId);

    // Remove any per-user Google Calendar sync preferences and imported event copies.
    data.settings = data.settings.filter((settings) => settings.userId !== userId);
    data.bands = data.bands.filter((band) => band.userId !== userId);
    data.gigs = data.gigs.filter((gig) => gig.userId !== userId);
    data.equipment = data.equipment.filter((item) => item.userId !== userId);

    // Future-proof cleanup in case separate Google sync stores are introduced later.
    if (Array.isArray(data.googleCalendarTokens)) {
      data.googleCalendarTokens = data.googleCalendarTokens.filter((token) => token.userId !== userId);
    }
    if (Array.isArray(data.googleCalendarConnections)) {
      data.googleCalendarConnections = data.googleCalendarConnections.filter((connection) => connection.userId !== userId);
    }
  });
}

async function listBands(userId) {
  const data = await readData();
  return data.bands
    .filter((band) => band.userId === userId)
    .sort((a, b) => a.name.localeCompare(b.name, "hr"))
    .map(({ userId: _userId, ...band }) => band);
}

async function listBandDirectory() {
  const data = await readData();
  const names = new Set();

  data.bandDirectory.forEach((entry) => {
    const name = asString(entry?.name ?? entry);
    if (isLikelyBandName(name)) {
      names.add(name);
    }
  });

  data.bands.forEach((band) => {
    const name = asString(band.name);
    if (isLikelyBandName(name)) {
      names.add(name);
    }
  });

  return [...names].sort((a, b) => a.localeCompare(b, "hr")).map((name) => ({ name }));
}

async function createBand(userId, payload) {
  const name = asString(payload.name);
  if (!name) {
    throw createHttpError(400, "Naziv benda je obavezan.");
  }

  const data = await readData();
  const normalizedName = name.toLocaleLowerCase("hr");
  const existing = data.bands.find((band) => asString(band.name).toLocaleLowerCase("hr") === normalizedName);
  if (existing) {
    const { userId: _userId, ...band } = existing;
    return band;
  }

  const band = {
    id: crypto.randomUUID(),
    userId,
    name,
    createdAt: nowIso(),
  };

  await updateData((next) => {
    next.bands.push(band);
  });

  const { userId: _userId, ...publicBand } = band;
  return publicBand;
}

async function updateBand(userId, bandId, payload) {
  const name = asString(payload.name);
  if (!name) {
    throw createHttpError(400, "Naziv benda je obavezan.");
  }

  const normalizedName = name.toLocaleLowerCase("hr");

  let updatedBand = null;
  await updateData((data) => {
    const band = data.bands.find((item) => item.id === bandId && item.userId === userId);
    if (!band) {
      throw createHttpError(404, "Bend nije pronaden.");
    }

    const duplicate = data.bands.find((item) => item.id !== bandId && asString(item.name).toLocaleLowerCase("hr") === normalizedName);
    if (duplicate) {
      throw createHttpError(409, "Bend s tim nazivom vec postoji.");
    }

    const oldName = band.name;
    band.name = name;
    updatedBand = { ...band };

    data.gigs.forEach((gig) => {
      if (gig.userId === userId && gig.bandName === oldName) {
        gig.bandName = name;
        gig.updatedAt = nowIso();
      }
    });
  });

  const { userId: _userId, ...publicBand } = updatedBand;
  return publicBand;
}

async function deleteBand(userId, bandId) {
  await updateData((data) => {
    data.bands = data.bands.filter((band) => !(band.id === bandId && band.userId === userId));
  });
}

async function listGigs(userId) {
  const data = await readData();
  return data.gigs
    .filter((gig) => gig.userId === userId)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      if ((a.time || "") !== (b.time || "")) return (a.time || "") < (b.time || "") ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    })
    .map(serializeGig);
}

async function createGig(userId, payload, forcedId = null) {
  const gig = normalizeGigPayload(payload);
  if (shouldPersistGigBand(gig)) {
    await ensureBandExists(userId, gig.bandName);
  }

  const row = {
    id: forcedId || crypto.randomUUID(),
    userId,
    ...gig,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await updateData((data) => {
    data.gigs.push(row);
  });

  return serializeGig(row);
}

async function updateGig(userId, gigId, payload) {
  const gig = normalizeGigPayload(payload);

  let updatedGig = null;
  await updateData((data) => {
    const existing = data.gigs.find((item) => item.id === gigId && item.userId === userId);
    if (!existing) {
      throw createHttpError(404, "Nastup nije pronaden.");
    }

    if (!asString(payload.source) && existing.source) {
      gig.source = existing.source;
    }

    if (shouldPersistGigBand(gig) && gig.bandName) {
      const alreadySaved = data.bands.some((band) => (
        band.userId === userId
        && asString(band.name).toLocaleLowerCase("hr") === gig.bandName.toLocaleLowerCase("hr")
      ));

      if (!alreadySaved) {
        data.bands.push({
          id: crypto.randomUUID(),
          userId,
          name: gig.bandName,
          createdAt: nowIso(),
        });
      }
    }

    Object.assign(existing, gig, { updatedAt: nowIso() });
    updatedGig = { ...existing };
  });

  return serializeGig(updatedGig);
}

async function deleteGig(userId, gigId) {
  await updateData((data) => {
    data.gigs = data.gigs.filter((gig) => !(gig.id === gigId && gig.userId === userId));
  });
}

async function importGoogleCalendarGigs(userId, payload) {
  const importedGigs = Array.isArray(payload.gigs) ? payload.gigs.map(normalizeGoogleImportGigPayload) : [];
  if (!importedGigs.length) {
    throw createHttpError(400, "Nema Google nastupa za uvoz.");
  }

  await updateData((data) => {
    importedGigs.forEach((gig) => {
      const existing = data.gigs.find((item) => (
        item.userId === userId
        && item.googleCalendar?.eventId === gig.googleCalendar.eventId
        && item.googleCalendar?.calendarId === gig.googleCalendar.calendarId
      ));

      if (existing) {
        Object.assign(existing, gig, {
          source: "google-import",
          updatedAt: nowIso(),
        });
        return;
      }

      data.gigs.push({
        id: crypto.randomUUID(),
        userId,
        ...gig,
        source: "google-import",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    });
  });

  return {
    importedCount: importedGigs.length,
    gigs: await listGigs(userId),
  };
}

async function listEquipment(userId) {
  const data = await readData();
  return data.equipment
    .filter((item) => item.userId === userId)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    })
    .map(({ userId: _userId, updatedAt: _updatedAt, createdAt: _createdAt, ...item }) => item);
}

async function createEquipment(userId, payload, forcedId = null) {
  const item = normalizeEquipmentPayload(payload);
  const row = {
    id: forcedId || crypto.randomUUID(),
    userId,
    ...item,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await updateData((data) => {
    data.equipment.push(row);
  });

  const { userId: _userId, updatedAt: _updatedAt, createdAt: _createdAt, ...publicItem } = row;
  return publicItem;
}

async function updateEquipment(userId, equipmentId, payload) {
  const item = normalizeEquipmentPayload(payload);
  let updatedItem = null;

  await updateData((data) => {
    const existing = data.equipment.find((entry) => entry.id === equipmentId && entry.userId === userId);
    if (!existing) {
      throw createHttpError(404, "Oprema nije pronadena.");
    }

    Object.assign(existing, item, { updatedAt: nowIso() });
    updatedItem = { ...existing };
  });

  const { userId: _userId, updatedAt: _updatedAt, createdAt: _createdAt, ...publicItem } = updatedItem;
  return publicItem;
}

async function deleteEquipment(userId, equipmentId) {
  await updateData((data) => {
    data.equipment = data.equipment.filter((item) => !(item.id === equipmentId && item.userId === userId));
  });
}

async function getSettings(userId) {
  const data = await readData();
  const row = data.settings.find((item) => item.userId === userId);
  return {
    clientId: GOOGLE_CLIENT_ID,
    calendarId: row?.googleCalendarId || "primary",
  };
}

async function saveSettings(userId, payload) {
  const settings = normalizeSettings(payload);
  await updateData((data) => {
    const existing = data.settings.find((item) => item.userId === userId);
    if (existing) {
      existing.googleCalendarId = settings.calendarId;
      return;
    }

    data.settings.push({
      userId,
      googleCalendarId: settings.calendarId,
    });
  });
}

async function seedDemoData(userId) {
  const gigs = await listGigs(userId);
  const equipment = await listEquipment(userId);
  if (gigs.length || equipment.length) {
    return buildBootstrapState(userId);
  }

  await createBand(userId, { name: "Ctrl Wave" });
  await createBand(userId, { name: "Moonlight Echo" });

  await createGig(userId, {
    bandName: "Ctrl Wave",
    date: getRelativeDate(-7),
    time: "21:00",
    location: "Zagreb, Vintage Industrial Bar",
    contractor: "Marko Event",
    fee: 1200,
    advance: 300,
    paymentMethod: "Racun",
    netEarning: 950,
    notes: "Odlicna publika i pun klub.",
  });

  await createGig(userId, {
    bandName: "Moonlight Echo",
    date: getRelativeDate(5),
    time: "20:30",
    location: "Split, wedding hall",
    contractor: "Wedding Studio",
    fee: 1800,
    advance: 500,
    paymentMethod: "Gotovina",
    netEarning: null,
    notes: "Privatni event.",
  });

  await createEquipment(userId, {
    date: getRelativeDate(-10),
    type: "Kupljeno",
    name: "Nord Stage 3",
    price: 1900,
    notes: "Rabljeno, odlicno stanje.",
  });

  await createEquipment(userId, {
    date: getRelativeDate(-2),
    type: "Prodano",
    name: "Shure SM58",
    price: 90,
    notes: "Prodano preko oglasa.",
  });

  return buildBootstrapState(userId);
}

function normalizeGigPayload(payload) {
  const gig = {
    bandName: asString(payload.bandName),
    date: asString(payload.date),
    time: asString(payload.time),
    location: asString(payload.location),
    contractor: asString(payload.contractor),
    contactPhone: asString(payload.contactPhone),
    contactEmail: asString(payload.contactEmail),
    fee: asNumber(payload.fee),
    advance: asNumber(payload.advance),
    paymentMethod: asString(payload.paymentMethod) || "Gotovina",
    netEarning: asNullableNumber(payload.netEarning),
    notes: asString(payload.notes),
    googleCalendar: payload.googleCalendar?.eventId ? {
      eventId: asString(payload.googleCalendar.eventId),
      calendarId: asString(payload.googleCalendar.calendarId) || "primary",
      syncedAt: asString(payload.googleCalendar.syncedAt) || nowIso(),
    } : null,
    source: asString(payload.source) || "manual",
  };

  if (!gig.bandName || !gig.date || !gig.location || !gig.contractor) {
    throw createHttpError(400, "Nedostaju obavezna polja nastupa.");
  }

  return gig;
}

function normalizeGoogleImportGigPayload(payload) {
  const gig = {
    bandName: asString(payload.bandName) || "Google Calendar",
    date: asString(payload.date),
    time: asString(payload.time),
    location: asString(payload.location),
    contractor: asString(payload.contractor) || "Google Calendar",
    contactPhone: asString(payload.contactPhone),
    contactEmail: asString(payload.contactEmail),
    fee: 0,
    advance: 0,
    paymentMethod: "Racun",
    netEarning: null,
    notes: asString(payload.notes),
    googleCalendar: {
      eventId: asString(payload.googleCalendar?.eventId),
      calendarId: asString(payload.googleCalendar?.calendarId) || "primary",
      syncedAt: nowIso(),
    },
  };

  if (!gig.date || !gig.googleCalendar.eventId) {
    throw createHttpError(400, "Google nastup nema dovoljno podataka za uvoz.");
  }

  return gig;
}

function normalizeEquipmentPayload(payload) {
  const item = {
    date: asString(payload.date),
    type: asString(payload.type),
    name: asString(payload.name),
    price: asNumber(payload.price),
    notes: asString(payload.notes),
  };

  if (!item.date || !item.type || !item.name) {
    throw createHttpError(400, "Nedostaju obavezna polja opreme.");
  }

  return item;
}

function normalizeSettings(payload) {
  return {
    calendarId: asString(payload.calendarId) || "primary",
  };
}

function shouldPersistGigBand(gig) {
  return gig?.source !== "google-import";
}

async function cleanupImportedGoogleBands() {
  let removedCount = 0;

  await updateData((data) => {
    const manualGigBandNamesByUser = new Map();
    const googleGigBandNamesByUser = new Map();
    const protectedBandNamesByUser = new Map();

    const rememberName = (bucket, userId, name) => {
      const normalizedName = asString(name).toLocaleLowerCase("hr");
      if (!userId || !normalizedName) {
        return;
      }

      if (!bucket.has(userId)) {
        bucket.set(userId, new Set());
      }

      bucket.get(userId).add(normalizedName);
    };

    data.gigs.forEach((gig) => {
      const source = asString(gig?.source) || "manual";
      if (source === "google-import") {
        rememberName(googleGigBandNamesByUser, gig.userId, gig.bandName);
        return;
      }

      rememberName(manualGigBandNamesByUser, gig.userId, gig.bandName);
    });

    data.users.forEach((user) => {
      rememberName(protectedBandNamesByUser, user.id, user.primaryBand);
    });

    const nextBands = data.bands.filter((band) => {
      const normalizedName = asString(band?.name).toLocaleLowerCase("hr");
      if (!band?.userId || !normalizedName) {
        return true;
      }

      if (!isLikelyBandName(band.name)) {
        removedCount += 1;
        return false;
      }

      const manualNames = manualGigBandNamesByUser.get(band.userId);
      if (manualNames?.has(normalizedName)) {
        return true;
      }

      const protectedNames = protectedBandNamesByUser.get(band.userId);
      if (protectedNames?.has(normalizedName)) {
        return true;
      }

      const googleNames = googleGigBandNamesByUser.get(band.userId);
      if (googleNames?.has(normalizedName)) {
        removedCount += 1;
        return false;
      }

      return true;
    });

    const nextBandDirectory = (Array.isArray(data.bandDirectory) ? data.bandDirectory : []).filter((entry) => {
      const name = asString(entry?.name ?? entry);
      if (!name) {
        return false;
      }

      if (!isLikelyBandName(name)) {
        removedCount += 1;
        return false;
      }

      return true;
    });

    if (data.bands.length !== nextBands.length) {
      data.bands = nextBands;
    }

    if ((Array.isArray(data.bandDirectory) ? data.bandDirectory.length : 0) !== nextBandDirectory.length) {
      data.bandDirectory = nextBandDirectory.map((entry) => ({ name: asString(entry?.name ?? entry) }));
    }
  });

  return removedCount;
}

async function ensureBandExists(userId, name) {
  if (!name) {
    return;
  }
  await createBand(userId, { name });
}

function serializeGig(row) {
  return {
    id: row.id,
    bandName: row.bandName,
    date: row.date,
    time: row.time,
    location: row.location,
    contractor: row.contractor,
    contactPhone: row.contactPhone || "",
    contactEmail: row.contactEmail || "",
    fee: row.fee,
    advance: row.advance,
    paymentMethod: row.paymentMethod,
    netEarning: row.netEarning,
    notes: row.notes,
    source: row.source || "manual",
    googleCalendar: row.googleCalendar?.eventId ? {
      eventId: row.googleCalendar.eventId,
      calendarId: row.googleCalendar.calendarId || "primary",
      syncedAt: row.googleCalendar.syncedAt || "",
    } : null,
  };
}

function serializeUser(user) {
  return user ? {
    id: user.id,
    email: user.email,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    address: user.address || "",
    phone: user.phone || "",
    primaryBand: user.primaryBand || "",
    primaryInstrument: user.primaryInstrument || "",
    createdAt: user.createdAt,
    billing: buildBillingState(user),
  } : null;
}

function buildBillingState(user) {
  const stripeEnabled = Boolean(getStripeClient() && STRIPE_PRICE_ID);
  const subscriptionStatus = user?.subscriptionStatus || "inactive";
  const subscriptionActive = isSubscriptionStatusActive(subscriptionStatus);
  const licenseStatus = getResolvedLicenseStatus(user);
  const licenseExpiresAt = user?.licenseExpiresAt || "";
  const licensePaidAt = user?.licensePaidAt || "";
  const licenseActive = hasUserAccess(user);
  const accessActive = licenseActive;

  return {
    accessActive,
    trialActive: false,
    trialDays: 0,
    trialEndsAt: "",
    trialDaysLeft: 0,
    licenseActive,
    licenseStatus,
    licensePaidAt,
    licenseExpiresAt,
    subscriptionActive,
    subscriptionStatus,
    subscriptionPaidAt: user?.subscriptionPaidAt || "",
    stripeEnabled,
    stripeConfigured: stripeEnabled,
    stripeCustomerId: user?.stripeCustomerId || "",
    priceLabel: BILLING_PRICE_LABEL,
    currency: BILLING_CURRENCY.toUpperCase(),
    licenseDurationDays: LICENSE_DURATION_DAYS,
    requiresPayment: !accessActive,
  };
}

function isTrialActive(user) {
  if (!user?.trialEndsAt) {
    return false;
  }

  return new Date(user.trialEndsAt).getTime() >= Date.now();
}

function isSubscriptionStatusActive(status) {
  return String(status || "").toLowerCase() === "active";
}

function isLicenseActive(user) {
  if (!user?.licenseExpiresAt) {
    return false;
  }

  return new Date(user.licenseExpiresAt).getTime() >= Date.now();
}

function hasUserAccess(user) {
  return isLicenseActive(user) || isSubscriptionStatusActive(user?.subscriptionStatus);
}

function getResolvedLicenseStatus(user) {
  if (hasUserAccess(user)) {
    return "active";
  }

  if (user?.licenseExpiresAt) {
    const expiresAt = new Date(user.licenseExpiresAt).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      return "expired";
    }
  }

  return asString(user?.licenseStatus) || "inactive";
}

function isPlaceholderUser(user) {
  return !asString(user?.passwordHash) || !asString(user?.passwordSalt);
}

function getStripeClient() {
  if (!STRIPE_SECRET_KEY || !Stripe) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(STRIPE_SECRET_KEY);
  }

  return stripeClient;
}

async function handleCreateCheckoutSession(request, response, user) {
  const stripe = getStripeClient();
  if (!stripe || !STRIPE_PRICE_ID) {
    throw createHttpError(503, "Stripe naplata jos nije konfigurirana na serveru.");
  }

  const origin = getRequestOrigin(request);
  const successUrl = `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/?checkout=cancelled`;
  const customerId = await ensureStripeCustomer(stripe, user);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [
      {
        price: STRIPE_PRICE_ID,
        quantity: 1,
      },
    ],
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId: user.id,
      email: user.email,
      purchaseType: "annual_license",
    },
  });

  return sendJson(response, 200, { url: session.url });
}

async function handlePublicCheckoutSession(request, response, body) {
  const email = normalizeEmail(body.email);
  if (!email) {
    throw createHttpError(400, "Upisi email adresu kako bismo vezali licencu uz tvoj racun.");
  }

  const data = await readData();
  let user = data.users.find((entry) => entry.email === email) || null;
  if (!user) {
    user = await createPlaceholderBillingUser(email);
  }

  const password = typeof body.password === "string" ? body.password : "";
  const firstName = asString(body.firstName);
  const lastName = asString(body.lastName);
  const phone = asString(body.phone);
  const primaryBand = asString(body.primaryBand);
  const primaryInstrument = asString(body.primaryInstrument);

  if (password || firstName || lastName || phone || primaryBand || primaryInstrument) {
    if (!password || !firstName || !lastName || !phone) {
      throw createHttpError(400, "Za registraciju su obavezni email, ime, prezime, broj mobitela i lozinka.");
    }

    if (!isPasswordStrongEnough(password)) {
      throw createHttpError(400, "Lozinka mora imati najmanje 8 znakova i barem jedan broj.");
    }

    await savePendingRegistration(user.id, {
      userId: user.id,
      email,
      password,
      firstName,
      lastName,
      phone,
      primaryBand,
      primaryInstrument,
      createdAt: nowIso(),
    });
  }

  return handleCreateCheckoutSession(request, response, user);
}

async function ensureStripeCustomer(stripe, user) {
  if (user?.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || undefined,
    phone: user.phone || undefined,
    metadata: {
      userId: user.id,
    },
  });

  await updateData((data) => {
    const target = data.users.find((entry) => entry.id === user.id);
    if (target) {
      target.stripeCustomerId = customer.id;
    }
  });

  return customer.id;
}

async function handleStripeWebhook(request, response, rawBody) {
  const stripe = getStripeClient();
  if (!stripe) {
    throw createHttpError(503, "Stripe nije konfiguriran.");
  }

  const signature = request.headers["stripe-signature"];
  if (!signature || !STRIPE_WEBHOOK_SECRET) {
    throw createHttpError(400, "Stripe webhook secret nije konfiguriran.");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    throw createHttpError(400, `Stripe webhook nije valjan: ${error.message}`);
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event.data.object);
      break;
    default:
      break;
  }

  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    ...getSecurityHeaders(),
  });
  response.end(JSON.stringify({ received: true }));
}

async function handleCheckoutSessionCompleted(session) {
  if (session.mode !== "payment") {
    return;
  }

  const userId = session.metadata?.userId || session.client_reference_id || "";
  const paidAt = nowIso();
  await updateStripeBillingForUser(userId, {
    stripeCustomerId: asString(session.customer),
    licenseStatus: "active",
    licensePaidAt: paidAt,
    licenseExpiresAt: addDaysFrom(LICENSE_DURATION_DAYS, paidAt),
  });

}

async function handleRestorePurchases(user) {
  return {
    restored: false,
    billing: buildBillingState(user),
    message: "Obnova kupnje je trenutno placeholder. TODO: povezati billing provider restore/sync tok.",
  };
}

async function updateStripeBillingForUser(userId, changes) {
  if (!userId) {
    return;
  }

  await updateData((data) => {
    const user = data.users.find((entry) => entry.id === userId);
    if (!user) {
      return;
    }

    if (changes.stripeCustomerId !== undefined) {
      user.stripeCustomerId = asString(changes.stripeCustomerId);
    }
    if (changes.stripeSubscriptionId !== undefined) {
      user.stripeSubscriptionId = asString(changes.stripeSubscriptionId);
    }
    if (changes.subscriptionStatus !== undefined) {
      user.subscriptionStatus = asString(changes.subscriptionStatus) || "inactive";
    }
    if (changes.subscriptionPaidAt !== undefined) {
      user.subscriptionPaidAt = asString(changes.subscriptionPaidAt);
    }
    if (changes.licenseStatus !== undefined) {
      user.licenseStatus = asString(changes.licenseStatus) || "inactive";
    }
    if (changes.licensePaidAt !== undefined) {
      user.licensePaidAt = asString(changes.licensePaidAt);
    }
    if (changes.licenseExpiresAt !== undefined) {
      user.licenseExpiresAt = asString(changes.licenseExpiresAt);
    }
  });
}

async function savePendingRegistration(userId, payload) {
  await updateData((data) => {
    const pendingRegistrations = Array.isArray(data.pendingRegistrations) ? data.pendingRegistrations : [];
    data.pendingRegistrations = pendingRegistrations.filter((item) => item.userId !== userId && item.email !== payload.email);
    data.pendingRegistrations.push({
      userId,
      email: payload.email,
      password: payload.password,
      firstName: payload.firstName,
      lastName: payload.lastName,
      phone: payload.phone,
      primaryBand: payload.primaryBand,
      primaryInstrument: payload.primaryInstrument,
      createdAt: payload.createdAt || nowIso(),
    });
  });
}

async function consumePendingRegistration(userId, email) {
  let found = null;

  await updateData((data) => {
    const pendingRegistrations = Array.isArray(data.pendingRegistrations) ? data.pendingRegistrations : [];
    const match = pendingRegistrations.find((item) => item.userId === userId || item.email === email) || null;
    found = match ? { ...match } : null;
    data.pendingRegistrations = pendingRegistrations.filter((item) => item !== match);
  });

  return found;
}

function isPasswordStrongEnough(password) {
  return typeof password === "string" && password.length >= 8 && /\d/.test(password);
}

function parseCookies(rawCookie) {
  return rawCookie.split(";").reduce((accumulator, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) {
      return accumulator;
    }
    accumulator[key] = decodeURIComponent(rest.join("="));
    return accumulator;
  }, {});
}

function buildSessionCookie(sessionId, secure = false) {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure ? "; Secure" : ""}`;
}

function buildExpiredSessionCookie(secure = false) {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

function buildExpiredSessionCookies() {
  return [
    buildExpiredSessionCookie(false),
    buildExpiredSessionCookie(true),
  ];
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) {
    return false;
  }

  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHash, "hex"));
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getIdFromPath(pathname) {
  return pathname.split("/").pop();
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isLikelyBandName(value) {
  const name = asString(value);
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

function asNumber(value) {
  return Number.isFinite(value) ? value : Number.parseFloat(value) || 0;
}

function asNullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return Number.isFinite(value) ? value : Number.parseFloat(value);
}

function nowIso() {
  return new Date().toISOString();
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function addDaysFrom(days, fromValue) {
  const date = fromValue ? new Date(fromValue) : new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function addMinutes(minutes) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function getRelativeDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...getSecurityHeaders(),
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(createHttpError(400, "Neispravan JSON payload."));
      }
    });

    request.on("error", reject);
  });
}

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function serveStatic(pathname, response) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  if (!isPublicPath(requestedPath)) {
    return sendJson(response, 404, { error: "Datoteka nije pronadena." });
  }

  const safePath = path.normalize(requestedPath).replace(/^[/\\]+/, "").replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) {
    return sendJson(response, 403, { error: "Pristup nije dopusten." });
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendJson(response, 404, { error: "Datoteka nije pronadena." });
  }

  response.writeHead(200, {
    "Content-Type": getContentType(path.extname(filePath).toLowerCase()),
    "Cache-Control": "no-store",
    ...getSecurityHeaders(),
  });
  fs.createReadStream(filePath).pipe(response);
}

function getContentType(extension) {
  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".webmanifest":
      return "application/manifest+json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getRequestOrigin(request) {
  const forwardedProto = typeof request.headers["x-forwarded-proto"] === "string"
    ? request.headers["x-forwarded-proto"].split(",")[0].trim()
    : "";
  const protocol = forwardedProto || (request.socket?.encrypted ? "https" : "http");
  return APP_URL || `${protocol}://${request.headers.host}`;
}

function ensureDataFile() {
  if (fs.existsSync(DATA_FILE)) {
    return;
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(createEmptyData(), null, 2));
}

function createEmptyData() {
  return {
    users: [],
    sessions: [],
    passwordResets: [],
    pendingRegistrations: [],
    settings: [],
    bandDirectory: [],
    bands: [],
    gigs: [],
    equipment: [],
  };
}

async function readData() {
  const raw = await fs.promises.readFile(DATA_FILE, "utf8");
  const data = JSON.parse(raw);
  return {
    users: Array.isArray(data.users) ? data.users.map(normalizeStoredUser) : [],
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    passwordResets: Array.isArray(data.passwordResets) ? data.passwordResets : [],
    pendingRegistrations: Array.isArray(data.pendingRegistrations) ? data.pendingRegistrations : [],
    settings: Array.isArray(data.settings) ? data.settings : [],
    bandDirectory: Array.isArray(data.bandDirectory) ? data.bandDirectory : [],
    bands: Array.isArray(data.bands) ? data.bands : [],
    gigs: Array.isArray(data.gigs) ? data.gigs : [],
    equipment: Array.isArray(data.equipment) ? data.equipment : [],
  };
}

function normalizeStoredUser(user) {
  const createdAt = user?.createdAt || nowIso();
  const trialStartedAt = user?.trialStartedAt || createdAt;
  const trialEndsAt = user?.trialEndsAt || "";
  const licenseExpiresAt = user?.licenseExpiresAt || "";
  const subscriptionStatus = isSubscriptionStatusActive(user?.subscriptionStatus) ? "active" : "inactive";

  return {
    ...user,
    createdAt,
    trialStartedAt,
    trialEndsAt,
    subscriptionStatus,
    subscriptionPaidAt: user?.subscriptionPaidAt || "",
    licenseStatus: user?.licenseStatus || (licenseExpiresAt && new Date(licenseExpiresAt).getTime() >= Date.now() ? "active" : subscriptionStatus === "active" ? "active" : "inactive"),
    licensePaidAt: user?.licensePaidAt || user?.subscriptionPaidAt || "",
    licenseExpiresAt,
    stripeCustomerId: user?.stripeCustomerId || "",
    stripeSubscriptionId: user?.stripeSubscriptionId || "",
  };
}

let writeQueue = Promise.resolve();

function updateData(mutator) {
  writeQueue = writeQueue.then(async () => {
    const data = await readData();
    mutator(data);
    await fs.promises.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  });

  return writeQueue;
}

function isSecureRequest(request) {
  if (!request) {
    return false;
  }

  if (request.socket?.encrypted) {
    return true;
  }

  const forwardedProto = request.headers["x-forwarded-proto"];
  return typeof forwardedProto === "string" && forwardedProto.split(",")[0].trim() === "https";
}

function isPublicPath(requestedPath) {
  if (PUBLIC_FILES.has(requestedPath)) {
    return true;
  }

  const extension = path.extname(requestedPath).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif", ".ico"].includes(extension);
}

function getSecurityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
}
