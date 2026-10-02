/**
 * Creates (or promotes) the official PetCloud administrator account.
 *
 *     ADMIN_OFFICIAL_EMAIL=<email> ADMIN_PASSWORD=<password> npm run bootstrap:admin
 *
 * Unlike `seed:demo`, this is meant for a real environment: the password is
 * never stored in the repository, it only comes from the environment of the
 * shell that runs the script.
 *
 * If the account already exists its password is NOT changed (pass
 * `--reset-password` to set ADMIN_PASSWORD on it); the script only makes sure
 * its role is `admin`. It never deletes or demotes anyone.
 */
import { asServiceRole, connect, upsertUser } from "./demo-db.mjs";

const email = process.env.ADMIN_OFFICIAL_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const resetPassword = process.argv.includes("--reset-password");

if (!email) {
  console.error("Set ADMIN_OFFICIAL_EMAIL.");
  process.exit(1);
}

const client = await connect();
try {
  await asServiceRole(client, async () => {
    const { rows } = await client.query(
      "SELECT id FROM auth.users WHERE lower(email) = $1",
      [email],
    );

    let userId = rows[0]?.id;
    if (!userId || resetPassword) {
      if (!password || password.length < 12) {
        throw new Error("Set ADMIN_PASSWORD (at least 12 characters).");
      }
      ({ id: userId } = await upsertUser(client, {
        email,
        password,
        role: "owner",
        first: "Equipo",
        last: "PetCloud",
      }));
    }

    // handle_new_user only creates owners/vets; the admin role is set here.
    await client.query("UPDATE profiles SET role = 'admin' WHERE id = $1", [
      userId,
    ]);
  });
  console.log(`Admin ready: ${email}`);
} catch (error) {
  console.error("bootstrap:admin failed:", error.message ?? error);
  process.exitCode = 1;
} finally {
  await client.end();
}
