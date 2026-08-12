import pg from 'pg';
import bcrypt from 'bcryptjs';

const POOL_MAX = parseInt(process.env.DB_POOL_MAX || '8');
const poolConfig: pg.PoolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      max: POOL_MAX,
      idleTimeoutMillis: 30000,
      // Hosted Postgres (Supabase, Render, etc.) requires TLS; their certs
      // aren't in Node's default trust store, so verification is relaxed
      // rather than disabled outright — the connection itself is still encrypted.
      ssl: process.env.DATABASE_URL.includes('localhost') ? undefined : { rejectUnauthorized: false },
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5434'),
      database: process.env.DB_NAME || 'nishant_infratech',
      user: process.env.DB_USER || 'nishant',
      password: process.env.DB_PASS || 'nishant123',
      max: POOL_MAX,
      idleTimeoutMillis: 30000,
    };

const pool = new pg.Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected PG pool error', err);
});

export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner','accountant','godown_manager','gatekeeper','collection_staff')) DEFAULT 'accountant',
        display_name TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        permission_name TEXT NOT NULL,
        UNIQUE(user_id, permission_name)
      );

      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('own_godown','rented_godown','rail_platform')) DEFAULT 'own_godown',
        rented_category TEXT CHECK(rented_category IN ('A','B','C')),
        address TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('cement','sariya')) DEFAULT 'cement',
        unit TEXT NOT NULL CHECK(unit IN ('bag','ton')) DEFAULT 'bag',
        product_type TEXT,
        manufacturer TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS parties (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        type TEXT NOT NULL CHECK(type IN ('dealer','contractor','builder','institution','supplier','other')) DEFAULT 'dealer',
        opening_balance REAL DEFAULT 0,
        opening_balance_type TEXT NOT NULL DEFAULT 'dr' CHECK(opening_balance_type IN ('dr','cr')),
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS vehicles (
        id SERIAL PRIMARY KEY,
        vehicle_number TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL CHECK(kind IN ('truck','trolley')) DEFAULT 'truck',
        ownership TEXT NOT NULL CHECK(ownership IN ('owned','rented')) DEFAULT 'owned',
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS drivers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS purchases (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity REAL NOT NULL,
        purchase_rate REAL NOT NULL,
        purchase_amount REAL GENERATED ALWAYS AS (quantity * purchase_rate) STORED,
        source TEXT NOT NULL CHECK(source IN ('factory','rail_rack','godown_transfer')) DEFAULT 'factory',
        location_id INTEGER NOT NULL REFERENCES locations(id),
        supplier_id INTEGER REFERENCES parties(id),
        vehicle_number TEXT,
        remarks TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS godown_opening_stock (
        id SERIAL PRIMARY KEY,
        location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity REAL NOT NULL DEFAULT 0,
        rate REAL NOT NULL DEFAULT 0,
        as_of_date TEXT,
        remarks TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(location_id, product_id)
      );

      CREATE TABLE IF NOT EXISTS dispatches (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('sale','stock_transfer')) DEFAULT 'sale',
        party_id INTEGER REFERENCES parties(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity REAL NOT NULL,
        rate REAL DEFAULT 0,
        total_amount REAL GENERATED ALWAYS AS (quantity * rate) STORED,
        source_location_id INTEGER REFERENCES locations(id),
        destination_type TEXT NOT NULL CHECK(destination_type IN ('own_godown','rented_godown','customer_site','self_pickup')) DEFAULT 'customer_site',
        destination_location_id INTEGER REFERENCES locations(id),
        destination_address TEXT,
        vehicle_id INTEGER REFERENCES vehicles(id),
        driver_id INTEGER REFERENCES drivers(id),
        driver_name TEXT,
        driver_mobile TEXT,
        payment_type TEXT CHECK(payment_type IN ('cash','credit')) DEFAULT 'cash',
        credit_days INTEGER,
        expected_delivery_date TEXT,
        status TEXT NOT NULL CHECK(status IN ('punched','dispatched','delivered','cancelled')) DEFAULT 'punched',
        otp_code TEXT,
        otp_generated_at TIMESTAMPTZ,
        otp_verified_at TIMESTAMPTZ,
        punched_by INTEGER REFERENCES users(id),
        fulfilled_by INTEGER REFERENCES users(id),
        remarks TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dispatch_notifications (
        id SERIAL PRIMARY KEY,
        dispatch_id INTEGER REFERENCES dispatches(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL CHECK(event_type IN ('order_punched','dispatch_created','otp_generated','otp_verified','payment_received')),
        message TEXT NOT NULL,
        recipient_role TEXT,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        party_id INTEGER NOT NULL REFERENCES parties(id),
        amount REAL NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('cash','bank')) DEFAULT 'bank',
        direction TEXT NOT NULL CHECK(direction IN ('pay','receive')) DEFAULT 'receive',
        bank_name TEXT,
        remarks TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS vehicle_trips (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
        driver_id INTEGER REFERENCES drivers(id),
        advance_amount REAL DEFAULT 0,
        product_id INTEGER REFERENCES products(id),
        quantity REAL DEFAULT 0,
        remarks TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS vehicle_trip_expenses (
        id SERIAL PRIMARY KEY,
        trip_id INTEGER NOT NULL REFERENCES vehicle_trips(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS vehicle_trip_unloading_points (
        id SERIAL PRIMARY KEY,
        trip_id INTEGER NOT NULL REFERENCES vehicle_trips(id) ON DELETE CASCADE,
        location_name TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT,
        description TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('cash','bank')) DEFAULT 'cash',
        bank_name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS rail_wagons (
        id SERIAL PRIMARY KEY,
        wagon_number TEXT NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity REAL NOT NULL,
        rate REAL NOT NULL DEFAULT 0,
        location_id INTEGER NOT NULL REFERENCES locations(id),
        arrival_date TEXT NOT NULL,
        purchase_id INTEGER REFERENCES purchases(id),
        remarks TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS rail_wagon_allocations (
        id SERIAL PRIMARY KEY,
        wagon_id INTEGER NOT NULL REFERENCES rail_wagons(id) ON DELETE CASCADE,
        outcome TEXT NOT NULL CHECK(outcome IN ('direct_wagon','platform_dump','godown_transfer','exchange')),
        quantity REAL NOT NULL,
        party_id INTEGER REFERENCES parties(id),
        destination_location_id INTEGER REFERENCES locations(id),
        dispatch_id INTEGER REFERENCES dispatches(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Driver role: staff who only see their own vehicle-trip ledger. Linked to a
    // `drivers` master row so their trips can be scoped server-side by driver_id.
    await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await client.query(`
      ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK(role IN ('owner','accountant','godown_manager','gatekeeper','collection_staff','driver'))
    `);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS linked_driver_id INTEGER REFERENCES drivers(id)`);

    // Drivers can ask the owner for a cash advance — surfaced in the notification bell.
    await client.query(`ALTER TABLE dispatch_notifications DROP CONSTRAINT IF EXISTS dispatch_notifications_event_type_check`);
    await client.query(`
      ALTER TABLE dispatch_notifications ADD CONSTRAINT dispatch_notifications_event_type_check
        CHECK(event_type IN ('order_requested','order_punched','dispatch_created','otp_generated','otp_verified','payment_received','advance_requested','driver_otp_submitted'))
    `);

    // Purchase-lot attribution: the same product can be bought from different
    // suppliers/rail-rack at different rates over time. A dispatch can pin
    // itself to the exact purchase lot it's being sold from (rate + supplier
    // traceability, mirrors cementbook's landed-rate-lot picker) — nullable
    // because stock-transfer dispatches and legacy rows don't need one.
    await client.query(`ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS source_purchase_id INTEGER REFERENCES purchases(id)`);

    // Driver self-report: the driver can type the OTP the customer read out to
    // them, right from their own ledger — it's held here for the owner to
    // glance at (matches / doesn't match the real otp_code) and one-tap
    // confirm or discard, without replacing the owner's own manual-entry path.
    await client.query(`ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS driver_submitted_otp TEXT`);
    await client.query(`ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS driver_submitted_at TIMESTAMPTZ`);

    // Order requests: the Orders page's "type in what the customer wants"
    // step deliberately does NOT create a real dispatch — it just logs the
    // ask here. A dispatch (and the real 'punched' status) only exists once
    // someone reviews it and explicitly proceeds via the full Punch Order
    // form on Sales & Dispatch. Keeps every dispatch row backed by a human
    // decision instead of an unattended auto-punch.
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_requests (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        party_id INTEGER NOT NULL REFERENCES parties(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity NUMERIC NOT NULL,
        rate NUMERIC,
        payment_type TEXT DEFAULT 'cash',
        credit_days INTEGER,
        expected_delivery_date DATE,
        destination_address TEXT,
        remarks TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','proceeded','discarded')),
        requested_by INTEGER REFERENCES users(id),
        dispatch_id INTEGER REFERENCES dispatches(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Seed default owner login
    const ownerCount = await client.query(`SELECT COUNT(*)::int AS c FROM users`);
    if (ownerCount.rows[0].c === 0) {
      const hash = await bcrypt.hash('nishant@123', 10);
      await client.query(
        `INSERT INTO users (username, password_hash, role, display_name) VALUES ($1,$2,$3,$4)`,
        ['owner', hash, 'owner', 'Nishant']
      );
    }

    // Seed locations
    const locCount = await client.query(`SELECT COUNT(*)::int AS c FROM locations`);
    if (locCount.rows[0].c === 0) {
      await client.query(`
        INSERT INTO locations (name, type, address) VALUES
          ('Basti Yard', 'own_godown', 'Basti'),
          ('Gorakhpur Store', 'own_godown', 'Gorakhpur'),
          ('Ayodhya Road Godown', 'own_godown', 'Ayodhya Road'),
          ('Rail Platform', 'rail_platform', NULL)
      `);
    }

    // Seed products — cement brands (bag) + Sariya sizes (ton)
    const prodCount = await client.query(`SELECT COUNT(*)::int AS c FROM products`);
    if (prodCount.rows[0].c === 0) {
      await client.query(`
        INSERT INTO products (name, category, unit, product_type, manufacturer) VALUES
          ('UltraTech Cement', 'cement', 'bag', 'OPC', 'UltraTech'),
          ('KJS Cement', 'cement', 'bag', 'OPC', 'KJS'),
          ('Mycem Cement', 'cement', 'bag', 'PPC', 'Mycem'),
          ('ACC Cement', 'cement', 'bag', 'OPC', 'ACC'),
          ('Shree Cement', 'cement', 'bag', 'PPC', 'Shree'),
          ('Sariya 8mm', 'sariya', 'ton', '8mm', NULL),
          ('Sariya 10mm', 'sariya', 'ton', '10mm', NULL),
          ('Sariya 12mm', 'sariya', 'ton', '12mm', NULL)
      `);
    }

    console.log('Database schema initialized');
  } finally {
    client.release();
  }
}

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

export async function getOne(text: string, params?: any[]) {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
}

export async function getAll(text: string, params?: any[]) {
  const result = await pool.query(text, params);
  return result.rows;
}

export default pool;
