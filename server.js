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

loadEnvFile();

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || "";
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || "Gazza Manager";
const SESSION_COOKIE = "glazbeni_dnevnik_session";
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "app-data.json");
const PUBLIC_FILES = new Set([
  "/index.html",
  "/style.css",
  "/app.js",
  "/logo.jpg",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
  "/service-worker.js",
]);
let mailTransporter = null;

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

    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      const body = await readJsonBody(request);
      return handleRegister(response, body);
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const body = await readJsonBody(request);
      return handleLogin(response, body);
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      await clearSession(cookies[SESSION_COOKIE]);
      response.setHeader("Set-Cookie", buildExpiredSessionCookie(isSecureRequest(request)));
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

    if (url.pathname === "/api/bootstrap" && request.method === "GET") {
      return sendJson(response, 200, await buildBootstrapState(session.userId));
    }

    if (url.pathname === "/api/settings" && request.method === "GET") {
      return sendJson(response, 200, await getSettings(session.userId));
    }

    if (url.pathname === "/api/settings" && request.method === "PUT") {
      const body = await readJsonBody(request);
      await saveSettings(session.userId, body);
      return sendJson(response, 200, await getSettings(session.userId));
    }

    if (url.pathname === "/api/mail-test" && request.method === "POST") {
      const user = await getUserById(session.userId);
      const sent = await sendTestEmail(user);
      return sendJson(response, 200, {
        ok: sent,
        message: sent
          ? `Testni email poslan na ${user?.email || "korisnika"}.`
          : "Testni email nije poslan. Provjeri SMTP postavke i server log.",
      });
    }

    if (url.pathname === "/api/profile" && (request.method === "PUT" || request.method === "POST")) {
      const body = await readJsonBody(request);
      return sendJson(response, 200, { user: await updateUserProfile(session.userId, body) });
    }

    if (url.pathname === "/api/profile" && request.method === "DELETE") {
      await deleteUserAccount(session.userId);
      response.setHeader("Set-Cookie", buildExpiredSessionCookie(isSecureRequest(request)));
      return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === "/api/bands" && request.method === "GET") {
      return sendJson(response, 200, await listBands(session.userId));
    }

    if (url.pathname === "/api/band-directory" && request.method === "GET") {
      return sendJson(response, 200, await listBandDirectory());
    }

    if (url.pathname === "/api/bands" && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, 201, await createBand(session.userId, body));
    }

    if (url.pathname.startsWith("/api/bands/") && request.method === "PUT") {
      const bandId = getIdFromPath(url.pathname);
      const body = await readJsonBody(request);
      return sendJson(response, 200, await updateBand(session.userId, bandId, body));
    }

    if (url.pathname.startsWith("/api/bands/") && request.method === "DELETE") {
      const bandId = getIdFromPath(url.pathname);
      await deleteBand(session.userId, bandId);
      return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === "/api/gigs" && request.method === "GET") {
      return sendJson(response, 200, await listGigs(session.userId));
    }

    if (url.pathname === "/api/gigs" && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, 201, await createGig(session.userId, body));
    }

    if (url.pathname === "/api/google-calendar/import" && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, 200, await importGoogleCalendarGigs(session.userId, body));
    }

    if (url.pathname.startsWith("/api/gigs/") && request.method === "PUT") {
      const gigId = getIdFromPath(url.pathname);
      const body = await readJsonBody(request);
      return sendJson(response, 200, await updateGig(session.userId, gigId, body));
    }

    if (url.pathname.startsWith("/api/gigs/") && request.method === "DELETE") {
      const gigId = getIdFromPath(url.pathname);
      await deleteGig(session.userId, gigId);
      return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === "/api/equipment" && request.method === "GET") {
      return sendJson(response, 200, await listEquipment(session.userId));
    }

    if (url.pathname === "/api/equipment" && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, 201, await createEquipment(session.userId, body));
    }

    if (url.pathname.startsWith("/api/equipment/") && request.method === "PUT") {
      const equipmentId = getIdFromPath(url.pathname);
      const body = await readJsonBody(request);
      return sendJson(response, 200, await updateEquipment(session.userId, equipmentId, body));
    }

    if (url.pathname.startsWith("/api/equipment/") && request.method === "DELETE") {
      const equipmentId = getIdFromPath(url.pathname);
      await deleteEquipment(session.userId, equipmentId);
      return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === "/api/demo/seed" && request.method === "POST") {
      return sendJson(response, 200, await seedDemoData(session.userId));
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
    throw createHttpError(409, "Korisnik s tim emailom vec postoji.");
  }

  const userId = await createUser({
    email,
    password,
    firstName,
    lastName,
    phone,
    primaryBand,
    primaryInstrument,
  });
  const user = await getUserById(userId);
  const registrationEmailSent = await sendRegistrationWelcomeEmail(user);
  const sessionId = await createSession(userId);
  response.setHeader("Set-Cookie", buildSessionCookie(sessionId, isSecureRequest(response.req)));
  return sendJson(response, 201, {
    user: serializeUser(user),
    registrationEmailSent,
  });
}

async function handleLogin(response, body) {
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const data = await readData();
  const user = data.users.find((item) => item.email === email);

  if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    throw createHttpError(401, "Neispravan email ili lozinka.");
  }

  const sessionId = await createSession(user.id);
  response.setHeader("Set-Cookie", buildSessionCookie(sessionId, isSecureRequest(response.req)));
  return sendJson(response, 200, { user: serializeUser(user) });
}

async function createUser(payload) {
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
    });

    data.settings.push({
      userId: id,
      googleCalendarId: "primary",
    });
  });

  return id;
}

async function getUserById(userId) {
  const data = await readData();
  return data.users.find((user) => user.id === userId) || null;
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
    return false;
  }

  const transporter = getMailTransporter();
  if (!transporter) {
    return false;
  }

  const firstName = user.firstName || "glazbeniku";
  const loginUrl = `http://${HOST}:${PORT}`;

  try {
    await transporter.sendMail({
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

    return true;
  } catch (error) {
    console.error("Slanje registracijskog emaila nije uspjelo:", error.message || error);
    return false;
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
    await transporter.sendMail({
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

    return true;
  } catch (error) {
    console.error("Slanje testnog emaila nije uspjelo:", error.message || error);
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
    if (name) {
      names.add(name);
    }
  });

  data.bands.forEach((band) => {
    const name = asString(band.name);
    if (name) {
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
  await ensureBandExists(userId, gig.bandName);

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

    // Google Calendar imports must never populate the saved band directory.
    if (existing.source !== "google-import" && gig.bandName) {
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
  } : null;
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

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
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
    users: Array.isArray(data.users) ? data.users : [],
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    settings: Array.isArray(data.settings) ? data.settings : [],
    bandDirectory: Array.isArray(data.bandDirectory) ? data.bandDirectory : [],
    bands: Array.isArray(data.bands) ? data.bands : [],
    gigs: Array.isArray(data.gigs) ? data.gigs : [],
    equipment: Array.isArray(data.equipment) ? data.equipment : [],
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
