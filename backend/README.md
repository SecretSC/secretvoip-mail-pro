# SecretVoIP Mail — Backend

Express + PostgreSQL backend for the SecretVoIP Mail reseller platform.
The frontend never talks to the upstream mail provider — every email
send is proxied through this backend, which holds the provider API key.

## Stack

- Node 20+
- Express 4
- PostgreSQL 14+
- JWT auth with bcrypt password hashing
- Helmet + CORS + per-route rate limiting

## Local dev

```bash
cd backend
cp .env.example .env
# edit .env — at minimum set JWT_SECRET, DATABASE_URL, MAIL_PROVIDER_API_KEY
npm install
npm run migrate
npm run seed:admin       # creates the first admin from .env
npm run dev              # http://localhost:4000
```

The frontend should be run with `VITE_API_URL=http://localhost:4000`.

## Production deploy (Linux VPS, Apache reverse proxy, systemd)

### 1. Server prep

```bash
sudo apt update && sudo apt install -y nodejs npm postgresql apache2
sudo a2enmod ssl proxy proxy_http headers rewrite
sudo useradd --system --create-home --shell /usr/sbin/nologin svm
```

### 2. Database

```bash
sudo -u postgres psql <<SQL
CREATE USER svm_user WITH PASSWORD 'CHANGE_ME';
CREATE DATABASE secretvoip_mail OWNER svm_user;
SQL
```

### 3. Deploy code

```bash
sudo mkdir -p /opt/secretvoip-mail
sudo chown svm:svm /opt/secretvoip-mail
# copy the repo's `backend/` folder to /opt/secretvoip-mail/backend
sudo -u svm bash -c '
  cd /opt/secretvoip-mail/backend
  cp .env.example .env
  # edit .env with production values (JWT_SECRET, DATABASE_URL, MAIL_PROVIDER_API_KEY, CORS_ORIGIN)
  npm ci --omit=dev
  npm install --no-save typescript tsx @types/node
  npm run build
  npm run migrate
  npm run seed:admin
'
```

### 4. systemd

```bash
sudo cp deploy/secretvoip-mail.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now secretvoip-mail
sudo systemctl status secretvoip-mail
```

### 5. Frontend

```bash
# On your dev machine
VITE_API_URL=https://secretvoip.com/mail npm run build
# Upload dist/ contents to /var/www/secretvoip-mail on the VPS
```

### 6. Apache

```bash
sudo cp deploy/apache-secretvoip-mail.conf /etc/apache2/sites-available/
sudo a2ensite secretvoip-mail.conf
sudo systemctl reload apache2
```

The site will be live at `https://secretvoip.com/mail/` and API calls
will be proxied to `127.0.0.1:4000`.

## Endpoints

| Method | Path                                | Auth   | Purpose                          |
|--------|-------------------------------------|--------|----------------------------------|
| POST   | `/api/auth/login`                   | none   | Email/password login → JWT       |
| GET    | `/api/me`                           | user   | Current user profile             |
| GET    | `/api/me/stats`                     | user   | Dashboard stats                  |
| POST   | `/api/email/send`                   | user   | Send a campaign (proxy upstream) |
| GET    | `/api/admin/customers`              | admin  | List customers                   |
| POST   | `/api/admin/customers`              | admin  | Create customer                  |
| POST   | `/api/admin/customers/:id/status`   | admin  | Suspend / unsuspend              |
| POST   | `/api/admin/customers/:id/password` | admin  | Reset password                   |
| POST   | `/api/admin/customers/:id/wallet`   | admin  | Top up / withdraw                |
| GET    | `/api/admin/diagnostics`            | admin  | Health, latency, uptime          |

## Security notes

- `MAIL_PROVIDER_API_KEY` is read **only** from `process.env` on the
  backend. It is never sent to the browser, never logged, and never
  included in any API response.
- All admin actions write to `audit_logs`.
- All wallet movements write to `wallet_transactions` (immutable history).
- Failed sends are NOT charged; only `ok=true` recipients are billed.

## Billing logic

Per `/api/email/send`:
1. Validate input, dedupe + filter invalid recipients.
2. Pre-flight balance check (>= 1 email worth of credit).
3. Create campaign row with status `sending`.
4. POST to upstream `MAIL_PROVIDER_BASE_URL/api/public/send` with
   `Authorization: Bearer MAIL_PROVIDER_API_KEY`.
5. Persist per-recipient results, charge wallet for accepted only,
   set campaign to `completed`. All in one transaction.
