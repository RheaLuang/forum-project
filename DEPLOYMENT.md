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
