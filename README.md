# Glazbeni dnevnik

Full-stack aplikacija za glazbenika s:

- korisnickim racunima i prijavom
- SQLite bazom
- CRUD API rutama za nastupe, bendove i opremu
- financijskim pregledima
- Google Calendar sinkronizacijom

## Pokretanje lokalno

```bash
npm start
```

Otvori:

```text
http://127.0.0.1:3000
```

## Prvi korak

Na prvoj stranici kreiraj novi racun preko registracije.

Ako u projektu vec postoji stari `data/app-data.json`, server ce ga pri prvom pokretanju automatski migrirati u SQLite i kreirati inicijalni racun:

```text
admin@local.test
admin123
```

## Docker

```bash
docker build -t glazbeni-dnevnik .
docker run -p 3000:3000 glazbeni-dnevnik
```

## API pregled

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/bootstrap`
- `GET/PUT /api/settings`
- `GET/POST /api/bands`
- `PUT/DELETE /api/bands/:id`
- `GET/POST /api/gigs`
- `PUT/DELETE /api/gigs/:id`
- `GET/POST /api/equipment`
- `PUT/DELETE /api/equipment/:id`

## Napomena za Google Calendar

Google OAuth za web app trazi pokretanje preko `http://localhost` ili `https` domene, ne preko `file://`.

Postavi zajednicki OAuth klijent za cijelu aplikaciju kroz varijablu okruzenja:

```bash
GOOGLE_CLIENT_ID=vas_google_oauth_client_id
```

Ili napravi lokalnu `.env` datoteku po uzoru na `.env.example`.

Za ispravan link u emailovima na produkciji postavi i:

```bash
APP_URL=https://vasa-domena.hr
```

Svaki korisnik nakon prijave u svoj Google racun vidi samo svoje Google kalendare i bira svoj kalendar za sinkronizaciju.
