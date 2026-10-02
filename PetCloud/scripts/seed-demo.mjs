/**
 * Creates the demo data on the database pointed at by DATABASE_URL.
 *
 *     DEMO_PASSWORD=<password> npm run seed:demo
 *
 * Accounts (all with DEMO_PASSWORD, see docs/desarrollo/entorno-local.md):
 *   - dueno@petcloud.local          owner with two pets, patients of the demo
 *                                   vet (signed consultations and vaccines)
 *   - vet@petcloud.local            vet with a validated license, an
 *                                   institution with Premium active, ERP
 *                                   products with stock and one sale
 *   - vet.pendiente@petcloud.local  vet whose license is PENDING (shows up in
 *                                   the admin validation queue)
 *   - admin@petcloud.local          platform admin (license validation queue)
 *
 * Local development only. Idempotent: running it again resets the passwords
 * and skips what already exists.
 */
import {
  DEMO_EMAILS,
  DEMO_INSTITUTION,
  DEMO_PENDING_INSTITUTION,
  asServiceRole,
  connect,
  upsertUser,
} from "./demo-db.mjs";

const password = process.env.DEMO_PASSWORD;
if (!password) {
  console.error("Set DEMO_PASSWORD (see docs/desarrollo/entorno-local.md).");
  process.exit(1);
}

const QR_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const block = () =>
  Array.from(
    { length: 4 },
    () => QR_ALPHABET[Math.floor(Math.random() * QR_ALPHABET.length)],
  ).join("");
const qrCode = () => `PC-${block()}-${block()}`;

const daysFromNow = (days) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function one(client, sql, params) {
  const { rows } = await client.query(sql, params);
  return rows[0];
}

async function seedVet(client) {
  const user = await upsertUser(client, {
    email: DEMO_EMAILS.vet,
    password,
    role: "vet",
    first: "Laura",
    last: "Méndez",
  });

  const institution =
    (await one(client, "SELECT id FROM vet_institutions WHERE name = $1", [
      DEMO_INSTITUTION,
    ])) ??
    (await one(
      client,
      `INSERT INTO vet_institutions (name, address, phone, website, validated, validated_at)
       VALUES ($1, 'Av. Maipú 2340, Vicente López', '+54 11 4791-5520',
               'vetsanroque.com.ar', true, now())
       RETURNING id`,
      [DEMO_INSTITUTION],
    ));

  const professional =
    (await one(
      client,
      "SELECT id FROM vet_professionals WHERE profile_id = $1",
      [user.id],
    )) ??
    (await one(
      client,
      `INSERT INTO vet_professionals (profile_id, institution_id, license_number,
         license_validated, license_reviewed_at, role_in_institution)
       VALUES ($1, $2, 'MP 4821', true, now(), 'owner')
       RETURNING id`,
      [user.id, institution.id],
    ));

  // A signature on file, so the demo vet can sign records right away.
  await client.query(
    `INSERT INTO vet_signatures (vet_professional_id, clarification,
       license_number, sworn_statement)
     SELECT $1, 'Dra. Laura Méndez', 'MP 4821',
            'Declaración jurada de la firma (cuenta de demo).'
      WHERE NOT EXISTS (SELECT 1 FROM vet_signatures
                         WHERE vet_professional_id = $1 AND superseded_at IS NULL)`,
    [professional.id],
  );

  const signature = await one(
    client,
    `SELECT id FROM vet_signatures
      WHERE vet_professional_id = $1 AND superseded_at IS NULL`,
    [professional.id],
  );

  // Premium: a current price and an authorized subscription (simulated, like
  // the demo checkout does).
  const price =
    (await one(
      client,
      "SELECT id, amount_cents, currency FROM premium_prices ORDER BY effective_from DESC LIMIT 1",
    )) ??
    (await one(
      client,
      `INSERT INTO premium_prices (amount_cents, currency)
       VALUES (2500000, 'ARS') RETURNING id, amount_cents, currency`,
    ));

  await client.query(
    `INSERT INTO vet_subscriptions (institution_id, price_id, amount_cents, currency,
       status, current_period_end, provider_subscription_id, provider_updated_at, created_by)
     VALUES ($1, $2, $3, $4, 'authorized', now() + interval '30 days',
             $6, now(), $5)
     ON CONFLICT (institution_id) DO UPDATE SET
       status = 'authorized', current_period_end = now() + interval '30 days',
       grace_until = NULL, cancelled_at = NULL`,
    [
      institution.id,
      price.id,
      price.amount_cents,
      price.currency,
      user.id,
      `SIMULADO-seed-${institution.id}`,
    ],
  );

  const products = [
    ["VAC-001", "Vacuna antirrábica", "Vacunas", 450000, 900000, 5, 20],
    [
      "ALI-010",
      "Alimento balanceado adulto 15 kg",
      "Alimentos",
      2800000,
      3900000,
      2,
      8,
    ],
    [
      "ANT-005",
      "Pipeta antipulgas perro mediano",
      "Antiparasitarios",
      600000,
      1100000,
      4,
      12,
    ],
  ];
  for (const [sku, name, category, cost, price, min, stock] of products) {
    const existing = await one(
      client,
      "SELECT id FROM erp.products WHERE institution_id = $1 AND sku = $2",
      [institution.id, sku],
    );
    if (existing) continue;

    const product = await one(
      client,
      `INSERT INTO erp.products (institution_id, sku, name, category, unit,
         cost_cents, price_cents, min_stock)
       VALUES ($1, $2, $3, $4, 'unidad', $5, $6, $7) RETURNING id`,
      [institution.id, sku, name, category, cost, price, min],
    );
    await client.query(
      `INSERT INTO erp.stock_movements (institution_id, product_id, kind, quantity,
         unit_cost_cents, note, created_by)
       VALUES ($1, $2, 'purchase', $3, $4, 'Stock inicial (demo)', $5)`,
      [institution.id, product.id, stock, cost, professional.id],
    );
  }

  console.log(`  ${user.created ? "+" : "="} ${DEMO_EMAILS.vet}`);
  return { user, institution, professional, signature };
}

/**
 * Makes the pet a patient of the demo institution: two completed visits, each
 * with a consultation signed by the demo vet, and the vaccines applied at the
 * second one (verified, so the owner's libreta shows them as signed). One
 * extra dose loaded by the owner stays unverified.
 */
async function seedClinicalHistory(client, { petId, pet, vet, user }) {
  const visits = [
    {
      days: -120,
      type: "vaccination",
      reason: "Vacunación anual",
      diagnosis: "Paciente sano. Se aplica antirrábica.",
      weight: pet.weight - 0.4,
    },
    {
      days: -15,
      type: "checkup",
      reason: "Control general",
      diagnosis: "Buen estado general, peso estable.",
      weight: pet.weight,
    },
  ];

  let firstRecordId = null;
  for (const visit of visits) {
    const record = await one(
      client,
      `INSERT INTO medical_records (pet_id, vet_professional_id, institution_id,
         type, date, reason, diagnosis, observations, weight_at_visit,
         is_signed, is_draft, signed_at, signature_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Registro de demo.', $8,
               true, false, now(), $9)
       RETURNING id`,
      [
        petId,
        vet.professional.id,
        vet.institution.id,
        visit.type,
        daysFromNow(visit.days),
        visit.reason,
        visit.diagnosis,
        visit.weight,
        vet.signature.id,
      ],
    );
    firstRecordId ??= record.id;

    await client.query(
      `INSERT INTO visits (pet_id, institution_id, owner_id, checked_in_at,
         checked_in_by_id, status, reason, medical_record_id, completed_at,
         summary)
       VALUES ($1, $2, $3, $4::date + time '10:00', $5, 'completed', $6, $7,
               $4::date + time '10:30', $8)`,
      [
        petId,
        vet.institution.id,
        user.id,
        daysFromNow(visit.days),
        vet.professional.id,
        visit.reason,
        record.id,
        visit.diagnosis,
      ],
    );
  }

  // Rabies applied and signed by the demo vet at the first visit.
  await client.query(
    `INSERT INTO vaccinations (pet_id, medical_record_id, vaccine_name,
       dose_number, applied_at, next_dose_at, location, applied_by_id,
       verified, signature_id, created_by_id)
     VALUES ($1, $2, 'Antirrábica', 'Refuerzo anual', $3, $4, $5, $6, true,
             $7, $8)`,
    [
      petId,
      firstRecordId,
      daysFromNow(-120),
      daysFromNow(245),
      DEMO_INSTITUTION,
      vet.professional.id,
      vet.signature.id,
      vet.user.id,
    ],
  );
  // A dose the owner loaded by hand: shows as "not verified".
  await client.query(
    `INSERT INTO vaccinations (pet_id, vaccine_name, dose_number, applied_at,
       next_dose_at, verified, created_by_id)
     VALUES ($1, $2, '1ª dosis', $3, $4, false, $5)`,
    [
      petId,
      pet.species === "dog" ? "Séxtuple" : "Triple felina",
      daysFromNow(-300),
      daysFromNow(20),
      user.id,
    ],
  );
}

async function seedOwner(client, vet) {
  const user = await upsertUser(client, {
    email: DEMO_EMAILS.owner,
    password,
    role: "owner",
    first: "Ana",
    last: "Gómez",
  });

  await client.query(
    "UPDATE profiles SET phone = '+54 11 5555-0101', address = 'Av. Libertador 1200' WHERE id = $1",
    [user.id],
  );

  const pets = [
    {
      name: "Luna",
      species: "dog",
      breed: "Labrador",
      sex: "female",
      born: "2021-03-14",
      weight: 24.5,
    },
    {
      name: "Michi",
      species: "cat",
      breed: "Siamés",
      sex: "male",
      born: "2022-08-02",
      weight: 4.2,
    },
  ];

  for (const pet of pets) {
    const created =
      (await one(
        client,
        "SELECT id FROM pets WHERE owner_id = $1 AND name = $2",
        [user.id, pet.name],
      )) ??
      (await one(
        client,
        `INSERT INTO pets (owner_id, name, species, breed, sex, date_of_birth,
           weight, neutered, qr_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8) RETURNING id`,
        [
          user.id,
          pet.name,
          pet.species,
          pet.breed,
          pet.sex,
          pet.born,
          pet.weight,
          qrCode(),
        ],
      ));

    const hasHistory = await one(
      client,
      "SELECT 1 FROM medical_records WHERE pet_id = $1 AND institution_id = $2",
      [created.id, vet.institution.id],
    );
    if (hasHistory) continue;
    await seedClinicalHistory(client, { petId: created.id, pet, vet, user });
  }

  console.log(`  ${user.created ? "+" : "="} ${DEMO_EMAILS.owner}`);
}

async function seedPendingVet(client) {
  const user = await upsertUser(client, {
    email: DEMO_EMAILS.pendingVet,
    password,
    role: "vet",
    first: "Martín",
    last: "Ruiz",
  });

  const institution =
    (await one(client, "SELECT id FROM vet_institutions WHERE name = $1", [
      DEMO_PENDING_INSTITUTION,
    ])) ??
    (await one(
      client,
      `INSERT INTO vet_institutions (name, address, phone)
       VALUES ($1, 'Calle Falsa 742, Olivos', '+54 11 4790-1234')
       RETURNING id`,
      [DEMO_PENDING_INSTITUTION],
    ));

  await client.query(
    `INSERT INTO vet_professionals (profile_id, institution_id, license_number,
       license_validated, role_in_institution)
     SELECT $1, $2, 'MP 7310', false, 'owner'
      WHERE NOT EXISTS (SELECT 1 FROM vet_professionals WHERE profile_id = $1)`,
    [user.id, institution.id],
  );

  console.log(`  ${user.created ? "+" : "="} ${DEMO_EMAILS.pendingVet}`);
}

/**
 * One cash sale through `erp.register_sale`, the same function the ERP uses,
 * so stock, cash and the dashboard stay consistent. It reads the institution
 * from the JWT claims, so it runs as the demo vet (not as service_role).
 */
async function seedSale(client, vet) {
  const existing = await one(
    client,
    "SELECT 1 FROM erp.sales WHERE institution_id = $1",
    [vet.institution.id],
  );
  if (existing) return;

  const products = await client.query(
    `SELECT id, price_cents FROM erp.products
      WHERE institution_id = $1 AND sku IN ('ALI-010', 'ANT-005')`,
    [vet.institution.id],
  );

  await client.query("BEGIN");
  try {
    await client.query(
      `SELECT set_config('request.jwt.claim.sub', $1, true),
              set_config('request.jwt.claims', $2, true)`,
      [
        vet.user.id,
        JSON.stringify({ sub: vet.user.id, role: "authenticated" }),
      ],
    );
    await client.query("SELECT erp.register_sale($1)", [
      JSON.stringify({
        customer_id: null,
        payment_method: "efectivo",
        items: products.rows.map((p) => ({
          product_id: p.id,
          quantity: 1,
          unit_price_cents: Number(p.price_cents),
        })),
      }),
    ]);
    await client.query("COMMIT");
    console.log("  + 1 ERP sale");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function seedAdmin(client) {
  const user = await upsertUser(client, {
    email: DEMO_EMAILS.admin,
    password,
    role: "owner",
    first: "Equipo",
    last: "PetCloud",
  });
  // handle_new_user only accepts owner/vet; the admin role is set here, as
  // service_role (the role-protection trigger exempts it).
  await client.query("UPDATE profiles SET role = 'admin' WHERE id = $1", [
    user.id,
  ]);
  console.log(`  ${user.created ? "+" : "="} ${DEMO_EMAILS.admin}`);
}

const client = await connect();
try {
  console.log("Seeding demo data\n");
  const vet = await asServiceRole(client, async () => {
    const vet = await seedVet(client);
    await seedOwner(client, vet);
    await seedPendingVet(client);
    await seedAdmin(client);
    return vet;
  });
  await seedSale(client, vet);
  console.log("\nDone. All demo accounts use DEMO_PASSWORD.");
} catch (error) {
  console.error("\nSeed failed:", error.message ?? error);
  process.exitCode = 1;
} finally {
  await client.end();
}
