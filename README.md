# Ecommerce Website

EcommerceWebsite is a responsive e-commerce storefront built with React and Vite, with an Express API and MySQL database. Customers can browse and search products, filter by category, manage a shopping bag, provide a delivery address or GPS location, and pay through Stripe. Store staff can sign in to manage products and orders.

## Features

- Responsive storefront with product details, search, category filters, offers, and stock information.
- Shopping bag with quantity controls and delivery-fee calculation.
- Checkout with delivery address and optional browser geolocation.
- Stripe Payment Element checkout in NZD, with webhook-based payment status updates.
- Admin sign-in and product creation, image upload, and archiving.
- Staff order listing and order-status updates through the API.
- Demo product catalog when the API is unavailable or the database has no active products.

## Tech stack

- React 19, React Router, Vite, and Axios
- Node.js and Express 5
- MySQL with `mysql2`
- Stripe (`@stripe/stripe-js`, `@stripe/react-stripe-js`, and `stripe`)

## Requirements

- Node.js and npm
- MySQL
- Stripe test or live API credentials to enable online payments

## Setup

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Create a MySQL database. The application defaults to a database named `ecomerce` (spelling as configured in the project); you can use another name by setting `DB_NAME`.

3. Apply the schema to that database:

   ```bash
   mysql -u root -p ecomerce < database/schema.sql
   ```

   If you use a different database name, create it first and substitute that name in the command.

4. Copy `.env.example` to `.env` and set your database credentials and a strong, random admin token secret. Add Stripe credentials to enable payments:

   ```dotenv
   PORT=3000
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_database_password
   DB_NAME=ecomerce
   ADMIN_TOKEN_SECRET=replace_with_a_long_random_secret
   STRIPE_SECRET_KEY=sk_test_...
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

   Keep `.env` and all secret keys private. `ADMIN_TOKEN_SECRET` is required for the API to start. Stripe settings are required for checkout; the webhook endpoint also requires `STRIPE_WEBHOOK_SECRET`. For local testing, configure your Stripe webhook to forward payment-intent events to `/api/payments/stripe/webhook`.

5. Start the frontend and API together:

   ```bash
   npm run dev:full
   ```

   Open the Vite URL printed in the terminal (usually `http://localhost:5173`). The Vite development server proxies `/api` requests to the API on port 3000.

## Create an admin account

After configuring `.env` and applying the database schema, run this from an interactive terminal:

```bash
npm run admin:create
```

Enter a valid email address and a password of at least 12 characters. Password entry is hidden. Then open `/admin` in the storefront and sign in to add or archive catalog products.

## Useful commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite frontend only. |
| `npm run server` | Start the Express API only. |
| `npm run dev:full` | Start the frontend and API together for development. |
| `npm run admin:create` | Interactively create an admin account. |
| `npm run build` | Build the frontend into `dist/`. |
| `npm run preview` | Preview the production frontend build. |
| `npm run lint` | Run ESLint. |

There is no test command currently defined in `package.json`.

## Production build

Build the frontend and then start the API:

```bash
npm run build
npm run server
```

When `dist/` exists, `server.js` serves the built frontend as well as the API. Configure your deployment environment with the required database settings and `ADMIN_TOKEN_SECRET`; add Stripe settings if accepting online payments. Ensure your production web server forwards Stripe webhook requests to the API unchanged so signature verification can succeed.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Check API and database connectivity. |
| `GET` | `/api/products` | List active products; supports `search`, `category`, `page`, and `limit` query parameters. |
| `GET` | `/api/products/:id/image` | Retrieve an uploaded product image. |
| `POST` | `/api/orders` | Create an order and Stripe payment intent. Requires Stripe configuration. |
| `POST` | `/api/payments/stripe/webhook` | Receive Stripe payment-intent webhook events. |
| `POST` | `/api/admin/login` | Sign in as an admin and receive a bearer token. |
| `POST` | `/api/products` | Create a product (admin bearer token required). |
| `DELETE` | `/api/products/:id` | Archive a product (admin bearer token required). |
| `GET` | `/api/admin/orders` | List recent orders (admin or order-manager bearer token required). |
| `PATCH` | `/api/admin/orders/:id/status` | Update an order status (admin or order-manager bearer token required). |

The API uses a NZ$3.50 delivery fee for orders below NZ$35 and free delivery at or above NZ$35. Product images uploaded through the admin form are limited to 5 MB and must be images.

## Project structure

```text
.
├── database/schema.sql       # MySQL tables and seed categories
├── scripts/create-admin.js   # Interactive admin account setup
├── server.js                 # Express API and production static-file server
├── src/
│   ├── App.jsx               # Storefront, checkout, and admin interface
│   ├── App.css               # Storefront styles
│   └── main.jsx              # React entry point
├── public/                   # Static icons and assets
├── .env.example              # Environment variable template
└── vite.config.js            # Vite configuration and API proxy
```
