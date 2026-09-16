/**
 * Are there login names that more than one business uses?
 *
 * A username only has to be unique inside a business in the database, but it is
 * typed at login with no business attached — so the app now refuses a name that
 * any tenant already holds (src/lib/usernames.ts). Accounts created before that
 * rule can still collide; when they do, login falls back to the password to tell
 * them apart, which stops working the day two of them share one.
 *
 * Read-only, twice over: nothing but SELECTs, inside a READ ONLY transaction, so
 * Postgres itself refuses any write this file could ever grow. Emails are
 * counted, never printed.
 *
 *   node scripts/check-duplicate-logins.mjs                 # the .env database
 *   node scripts/check-duplicate-logins.mjs --env .env.test # another one
 *   DATABASE_URL=postgres://… node scripts/check-duplicate-logins.mjs
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const argv = process.argv.slice(2);
/** Enough to act on; a full dump belongs in a spreadsheet, not a terminal. */
const MAX_ROWS = 60;
const envFile = argv.includes("--env") ? argv[argv.indexOf("--env") + 1] : ".env";

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const file = path.resolve(process.cwd(), envFile);
  if (!fs.existsSync(file)) throw new Error(`No DATABASE_URL, and ${envFile} does not exist.`);
  const match = /^\s*DATABASE_URL\s*=\s*["']?([^"'\r\n]+)/m.exec(fs.readFileSync(file, "utf8"));
  if (!match) throw new Error(`No DATABASE_URL in ${envFile}.`);
  return match[1];
}

const url = databaseUrl();
const client = new pg.Client({
  connectionString: url,
  // Supabase's pooler presents a certificate for its own domain.
  ssl: /supabase|amazonaws|neon|render/.test(url) ? { rejectUnauthorized: false } : undefined,
});

const DUPLICATES = `
  select lower(btrim(u.username)) as identifiant,
         count(*)::int as comptes,
         count(*) filter (where u.is_active)::int as comptes_actifs,
         string_agg(distinct t.name, ' | ' order by t.name) as entreprises
  from users u
  join tenants t on t.id = u.tenant_id
  group by 1
  having count(*) > 1
  order by comptes desc, identifiant`;

const DETAIL = `
  select u.username,
         u.is_active,
         u.role,
         (u.email is not null and u.email <> '') as a_un_email,
         to_char(u.created_at, 'YYYY-MM-DD') as cree_le,
         t.name as entreprise,
         t.status as etat_entreprise
  from users u
  join tenants t on t.id = u.tenant_id
  where lower(btrim(u.username)) in (
    select lower(btrim(username)) from users group by 1 having count(*) > 1
  )
  order by lower(btrim(u.username)), u.created_at`;

const EMAILS = `
  select count(*)::int as comptes_actifs,
         count(*) filter (where email is not null and email <> '')::int as avec_email,
         count(*) filter (where email_verified)::int as email_verifie
  from users
  where is_active`;

try {
  await client.connect();
  const { host, pathname } = new URL(url);
  console.log(`Base : ${host}${pathname}\n`);

  await client.query("begin transaction read only");
  const duplicates = (await client.query(DUPLICATES)).rows;
  const detail = duplicates.length ? (await client.query(DETAIL)).rows : [];
  const emails = (await client.query(EMAILS)).rows[0];
  await client.query("commit");

  console.log("── Noms d'utilisateur partagés par plusieurs entreprises ──");
  if (duplicates.length === 0) {
    console.log("Aucun. Chaque identifiant désigne un seul compte.\n");
  } else {
    // A long list of businesses would push the counts off the screen; the names
    // that matter are in the detail table below.
    const short = (names) => {
      const list = (names ?? "").split(" | ");
      return list.length > 4 ? `${list.slice(0, 4).join(" | ")} … +${list.length - 4}` : names;
    };
    console.table(duplicates.map((r) => ({ ...r, entreprises: short(r.entreprises) })));
    console.log(`${duplicates.length} identifiant(s) en double.\n`);

    console.log("── Les comptes concernés ──");
    console.table(detail.slice(0, MAX_ROWS));
    if (detail.length > MAX_ROWS) {
      console.log(`… ${detail.length - MAX_ROWS} ligne(s) de plus, non affichées.\n`);
    }
    console.log(
      "Un seul de ces comptes peut garder le nom. Les autres se renomment depuis\n" +
        "Paramètres → Utilisateurs, dans leur propre entreprise.\n"
    );
  }

  console.log("── Adresses email sur les comptes actifs ──");
  console.table([emails]);
} finally {
  await client.end();
}
