/**
 * Removes what `npm run seed:demo` created: the demo accounts (their pets,
 * clinical records, visits and vaccinations go with them by cascade) and the
 * demo institutions (with their ERP data, also by cascade).
 *
 *     npm run unseed:demo
 */
import {
  DEMO_EMAILS,
  DEMO_INSTITUTION,
  DEMO_PENDING_INSTITUTION,
  connect,
} from "./demo-db.mjs";

const client = await connect();
try {
  await client.query("BEGIN");
  // Two guards stand in the way of wiping the demo: the last platform admin
  // cannot be deleted, and signatures are append-only. Both are switched off
  // for this transaction only (DDL is transactional).
  await client.query(
    "ALTER TABLE profiles DISABLE TRIGGER profiles_protect_last_admin",
  );
  await client.query(
    "ALTER TABLE vet_signatures DISABLE TRIGGER vet_signatures_append_only",
  );

  // Owner first: its pets cascade to the clinical records that reference the
  // vet's signature (ON DELETE RESTRICT), so they must go before the vet.
  const owner = await client.query(
    "DELETE FROM auth.users WHERE lower(email) = $1 RETURNING email",
    [DEMO_EMAILS.owner],
  );
  const demoEmails = Object.values(DEMO_EMAILS);
  await client.query(
    `DELETE FROM vet_signatures WHERE vet_professional_id IN (
       SELECT vp.id FROM vet_professionals vp
         JOIN auth.users u ON u.id = vp.profile_id
        WHERE lower(u.email) = ANY($1))`,
    [demoEmails],
  );
  const others = await client.query(
    "DELETE FROM auth.users WHERE lower(email) = ANY($1) RETURNING email",
    [demoEmails.filter((e) => e !== DEMO_EMAILS.owner)],
  );
  const institutions = await client.query(
    "DELETE FROM vet_institutions WHERE name = ANY($1) RETURNING id",
    [[DEMO_INSTITUTION, DEMO_PENDING_INSTITUTION]],
  );

  await client.query(
    "ALTER TABLE profiles ENABLE TRIGGER profiles_protect_last_admin",
  );
  await client.query(
    "ALTER TABLE vet_signatures ENABLE TRIGGER vet_signatures_append_only",
  );
  await client.query("COMMIT");
  console.log(
    `Removed ${owner.rowCount + others.rowCount} account(s) and ${institutions.rowCount} institution(s).`,
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Unseed failed:", error.message ?? error);
  process.exitCode = 1;
} finally {
  await client.end();
}
