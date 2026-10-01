# Forge Club Gym Management

Expo mobile client, Express REST API, and MySQL database for gym staff and members.

## Features

- Admin dashboard with attendance, active-member, schedule, and revenue summaries.
- Member search, onboarding, and active/inactive access controls.
- Class schedule management, capacity tracking, class reservations, and cancellations.
- Member check-in, membership plan details, progress summaries, and account screen.
- Payment ledger endpoints and admin billing overview.
- Admin manual payment recording for cash or externally settled transactions.
- JWT authentication with admin/member role enforcement.
- Demo sign-in and sample data when the API is offline.

## Run Locally (Windows)

Prerequisites: Node.js 20 or newer, npm, and Docker Desktop.

1. Install API packages:

   ```powershell
   npm.cmd --prefix server install
   ```

2. Start MySQL and wait until the container is healthy:

   ```powershell
   npm.cmd run db:up
   docker compose ps
   ```

3. Seed plans, demo users, and sample classes:

   ```powershell
   npm.cmd --prefix server run seed
   ```

4. Start the API in one terminal:

   ```powershell
   npm.cmd run api
   ```

5. Start Expo in another terminal and open the QR code using Expo Go:

   ```powershell
   npm.cmd run mobile
   ```

For a physical phone, copy [mobile/.env.example](mobile/.env.example) to `mobile/.env` and replace `localhost` with the computer's LAN IP. Keep the phone and computer on the same network, then restart Expo.

## Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@forgegym.com` | `gym1234` |
| Member | `member@forgegym.com` | `gym1234` |
| Trainer | `sam@forgegym.com` | `gym1234` |

New members created by an admin receive a temporary password of `Welcome123!`. Change the seed and temporary passwords before any deployment.

## API

The API listens on port `4000`. Health check: `GET /api/health`.

Authentication: `POST /api/auth/login`, `GET /api/me`.

Gym workflows: `GET /api/dashboard`, `/api/members`, `/api/classes`, `/api/plans`, `/api/bookings`, `/api/attendance`, and `/api/payments`. Admin routes enforce role permissions. Member booking creation and cancellation, attendance check-in, and admin member/class creation use `POST`, `DELETE`, and `PATCH` endpoints under those resources.

Copy [server/.env.example](server/.env.example) to `server/.env` to override the local MySQL connection or JWT secret. The Compose database uses local development credentials and must not be exposed to the public internet.

## Project Layout

- `mobile/`: Expo React Native app.
- `server/`: Express API, JWT authorization, and seed script.
- `database/schema.sql`: MySQL tables and indexes.
- `docker-compose.yml`: local MySQL service with persistent storage.

Payment entries are ledger records only. Card charges, recurring billing, refunds, tax handling, and payment-provider webhooks require a provider integration (for example Stripe) before production use.