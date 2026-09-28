# BLACKPINK Fan Management System

A small learning project built with HTML, CSS, JavaScript, Node.js, Express, and SQLite. Admins manage fan members; members can view their membership, edit their own profile, and change their password.

## First-time setup on Windows

1. Install [Node.js](https://nodejs.org/) version 22.13 or newer. Node includes npm, which downloads the app's packages.
2. Open this project folder in File Explorer. Click the address bar, type `powershell`, and press **Enter** to open a terminal in the folder.
3. Run `npm install` to download the packages listed in `package.json`.
4. Run `Copy-Item .env.example .env`, then `notepad .env`. Set `ADMIN_EMAIL` to the email you want to use. Set `SESSION_SECRET` to a long, random value. To generate one, run the command below and paste its output after `SESSION_SECRET=`. Save and close Notepad.

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

5. Run `npm run db:init`. This creates the SQLite tables and a development admin account. **Copy the initial admin password shown in the terminal; it is shown only once.** The database stores its hash, never the plain password. Running setup again does not create another admin or change its password.
6. Run `npm start`, then open [http://localhost:3000](http://localhost:3000). Sign in using `ADMIN_EMAIL` and the password from step 5.

Press **Ctrl+C** in the terminal to stop the server. Use `npm run dev` instead of `npm start` when you want the server to restart after code changes. If you already set up this workspace, keep the existing `.env` and database; restart with `npm start`. Your existing admin password is unchanged.

If you lose the admin password, run `npm run db:reset-admin`. It generates a new one, shows it once, and makes the old password invalid. Keep the new password somewhere private. Do not put it in `.env` or commit it to GitHub.

## Using the app

**Admin:** The dashboard shows total profiles, active members, and members who joined in the last 30 days. Choose **Members** to search, add, view, edit, or deactivate a profile. Deactivation keeps the record but blocks sign-in. Adding a member requires an initial password of at least 12 characters; share it privately with that member. Profile pictures use an optional `http` or `https` URL rather than an upload.

**Member:** An admin must create the member account first. The member can sign in with that email and initial password, view membership details and a profile, edit personal details, and change their password. Member ID, join date, and membership status are not editable by members. Age is calculated from birthdate when the profile is displayed.

The pages adapt to smaller screens. The member table can scroll sideways on narrow screens, and forms switch to one column. Forms show validation errors, successful actions show confirmation messages, and deactivation asks for confirmation.

## Tests and project files

Run `npm test` to check authentication, permissions, database setup, member management, validation, and the member portal. Tests use temporary data and do not change your local member records.

| Path | Purpose |
| --- | --- |
| `app.js` | Starts Express and connects the routes |
| `routes/` and `middleware/` | Login, role protection, admin actions, and member actions |
| `database/` | SQLite connection, schema, and setup commands |
| `views/` | HTML and EJS page templates |
| `public/css/` and `public/js/` | Browser styles and scripts |
| `test/` | Automated checks |

The live data is stored in `database/fan_management.sqlite` by default. `.env`, the database file, and SQLite journal files are excluded from Git so private data stays on your computer. Commit the source code, `.env.example`, and `database/schema.sql` to GitHub. GitHub stores the project code; it does not run the app or host its live database.

Sessions use an in-memory store in this learning version, so everyone must sign in again after a server restart. This setup is intended for local development; public deployment would need a persistent session store and a hosted database. On Node 22, an `ExperimentalWarning` about its built-in SQLite module may appear; it does not stop the app.
