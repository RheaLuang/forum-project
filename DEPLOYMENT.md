# Cloud deployment checklist

## 1. Local environment

Copy `.env.example` to `.env` and fill in the local MySQL values.

```powershell
npm install
npm run db:test
npm start
```

Open `http://localhost:3000`. Express serves both the frontend and backend
locally, so no separate static server is required.

## 2. Aiven MySQL

Create an Aiven for MySQL service and copy its host, port, user, password, and
database name into `.env`. Download the service CA certificate as `ca.pem`.

```env
DB_HOST=your-aiven-host
DB_PORT=your-aiven-port
DB_USER=avnadmin
DB_PASSWORD=your-aiven-password
DB_NAME=defaultdb
DB_SSL=true
DB_CA_PATH=./ca.pem
```

Verify the connection:

```powershell
npm run db:test
```

## 3. Import the schema

For a new database, import `db/schema.sql`:

```powershell
mysql --host=$env:DB_HOST --port=$env:DB_PORT --user=$env:DB_USER --password --ssl-mode=VERIFY_CA --ssl-ca=ca.pem $env:DB_NAME
```

Then run this inside the MySQL client:

```sql
SOURCE db/schema.sql;
```

If the local database already contains data, export and import it instead:

```powershell
mysqldump --host=localhost --user=root --password --single-transaction --routines --triggers forum_db > forum_db.sql
mysql --host=$env:DB_HOST --port=$env:DB_PORT --user=$env:DB_USER --password --ssl-mode=VERIFY_CA --ssl-ca=ca.pem $env:DB_NAME < forum_db.sql
```

## 4. Frontend API address

For local development, keep:

```js
window.FORUM_CONFIG = {
  API_URL: 'http://localhost:3000'
};
```

After the backend is deployed, replace the value in `config.js` with the HTTPS
backend URL.

## 5. Cloudinary uploads

Create a Cloudinary account and add these values to `.env` locally and to the
backend hosting provider's environment variables:

```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Verify avatar, post, and kitchen image uploads:

```powershell
npm run test:uploads
```

The smoke test creates temporary Aiven and Cloudinary data and removes it when
the test finishes.

## 6. Cloudflare D1

Cloudflare D1 is SQLite-based and is accessed from this Render backend through
Cloudflare's D1 REST API. Keep MySQL active until the D1 import has been tested.

Create a D1 database in Cloudflare, then create an API token with D1 edit
permission. Add these variables locally and later in Render:

```env
DB_DRIVER=d1
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
CLOUDFLARE_D1_DATABASE_ID=your-d1-database-id
CLOUDFLARE_API_TOKEN=your-d1-api-token
```

Import the current Aiven/MySQL data directly into D1:

```powershell
npm run db:d1:migrate
```

Or export an importable SQL file first:

```powershell
npm run db:d1:export
```

The export script writes `outputs/forum-d1-import.sql`. You can import that file
with Cloudflare Wrangler:

```powershell
npx wrangler d1 execute YOUR_D1_DATABASE_NAME --remote --file outputs/forum-d1-import.sql
```

After import, test against D1:

```powershell
$env:DB_DRIVER="d1"
npm run db:test
npm run test:app
```

When tests pass, change Render's `DB_DRIVER` to `d1`, add the three Cloudflare
variables above, and redeploy. The MySQL variables can stay temporarily as a
rollback option.
