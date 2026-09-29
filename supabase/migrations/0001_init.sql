-- Progresss: skema awal (Fasa 1)
-- Kilang OEM produk kesihatan (minuman & pil), make-to-order, kerja bermula selepas deposit.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Enum
-- ─────────────────────────────────────────────────────────────
create type user_role as enum ('admin', 'planner', 'supervisor', 'store', 'qc', 'finance', 'client');
create type product_form as enum ('tablet', 'capsule', 'softgel', 'drink_liquid', 'drink_powder', 'other');
create type material_category as enum ('active', 'excipient', 'flavour', 'packaging', 'label', 'other');
create type lot_status as enum ('quarantine', 'released', 'rejected', 'expired', 'depleted');
create type movement_type as enum ('receive', 'issue', 'adjust', 'return', 'dispose');
create type job_status as enum (
  'draft', 'awaiting_deposit', 'confirmed', 'scheduled', 'in_production',
  'qc', 'ready', 'delivered', 'completed', 'cancelled'
);
create type batch_stage as enum (
  'planned', 'material_issued', 'processing', 'forming', 'packing', 'qc', 'released', 'rejected'
);
create type invoice_type as enum ('deposit', 'balance', 'full', 'other');
create type invoice_status as enum ('draft', 'issued', 'partially_paid', 'paid', 'void');
create type payment_status as enum ('pending', 'success', 'failed', 'refunded');

-- ─────────────────────────────────────────────────────────────
-- Master data
-- ─────────────────────────────────────────────────────────────
create table clients (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  ssm_no text,
  tin text,                                   -- untuk e-Invois LHDN
  contact_name text,
  phone text,
  email text,
  address text,
  deposit_percent numeric(5,2) not null default 50 check (deposit_percent between 0 and 100),
  credit_days int not null default 0,
  is_internal boolean not null default false, -- true untuk Dinero
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role user_role not null default 'client',
  client_id uuid references clients(id),      -- role 'client' tanpa client_id = tiada akses
  created_at timestamptz not null default now()
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  code text unique not null,
  name text not null,
  form product_form not null,
  pack_unit text not null default 'botol',    -- botol / kotak / sachet / blister
  pack_size text,                             -- cth: "60 kapsul", "500ml"
  registration_no text,                       -- NPRA MAL / kelulusan KKM
  halal_cert_no text,
  shelf_life_months int not null default 24,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table raw_materials (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  category material_category not null,
  uom text not null,                          -- kg / g / L / ml / pcs
  reorder_level numeric(14,3) not null default 0,
  is_halal boolean,
  default_supplier_id uuid references suppliers(id),
  created_at timestamptz not null default now()
);

-- Formula: kuantiti bahan bagi SATU unit produk (pack_unit)
create table bom_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  raw_material_id uuid not null references raw_materials(id),
  qty_per_unit numeric(14,6) not null check (qty_per_unit > 0),
  wastage_percent numeric(5,2) not null default 0,
  unique (product_id, raw_material_id)
);

-- ─────────────────────────────────────────────────────────────
-- Stok bahan mentah (ikut lot)
-- ─────────────────────────────────────────────────────────────
create table raw_material_lots (
  id uuid primary key default gen_random_uuid(),
  raw_material_id uuid not null references raw_materials(id),
  supplier_id uuid references suppliers(id),
  lot_no text not null,
  received_qty numeric(14,3) not null check (received_qty > 0),
  remaining_qty numeric(14,3) not null check (remaining_qty >= 0),
  unit_cost numeric(14,4),
  received_at timestamptz not null default now(),
  expiry_date date,
  status lot_status not null default 'quarantine',
  coa_url text,
  created_at timestamptz not null default now(),
  unique (raw_material_id, lot_no)
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references raw_material_lots(id),
  raw_material_id uuid not null references raw_materials(id),
  type movement_type not null,
  qty numeric(14,3) not null,                 -- +masuk / -keluar
  ref_table text,
  ref_id uuid,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- Lot baru: rekod pergerakan 'receive'
create or replace function lots_after_insert() returns trigger language plpgsql as $$
begin
  insert into stock_movements (lot_id, raw_material_id, type, qty, ref_table, ref_id)
  values (new.id, new.raw_material_id, 'receive', new.received_qty, 'raw_material_lots', new.id);
  return new;
end $$;
create trigger lots_after_insert after insert on raw_material_lots
  for each row execute function lots_after_insert();

-- ─────────────────────────────────────────────────────────────
-- Pengeluaran
-- ─────────────────────────────────────────────────────────────
create table production_lines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  line_type text not null check (line_type in ('pill', 'drink')),
  capacity_per_day numeric(14,0),
  active boolean not null default true
);

create sequence job_order_seq;
create table job_orders (
  id uuid primary key default gen_random_uuid(),
  jo_no text unique not null default ('JO' || to_char(now(), 'YYMM') || '-' || lpad(nextval('job_order_seq')::text, 4, '0')),
  client_id uuid not null references clients(id),
  product_id uuid not null references products(id),
  quantity numeric(14,0) not null check (quantity > 0),
  unit_price numeric(14,4) not null default 0,
  total_amount numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  deposit_amount numeric(14,2) not null default 0,
  requested_date date,
  promised_date date,
  status job_status not null default 'draft',
  deposit_paid_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence batch_seq;
create table production_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text unique not null default ('B' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('batch_seq')::text, 4, '0')),
  job_order_id uuid not null references job_orders(id),
  line_id uuid references production_lines(id),
  planned_qty numeric(14,0) not null check (planned_qty > 0),
  good_qty numeric(14,0) not null default 0,
  reject_qty numeric(14,0) not null default 0,
  stage batch_stage not null default 'planned',
  planned_start date,
  planned_end date,
  actual_start timestamptz,
  actual_end timestamptz,
  manufacture_date date,
  expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table batch_stage_logs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references production_batches(id) on delete cascade,
  from_stage batch_stage,
  to_stage batch_stage not null,
  good_qty numeric(14,0),
  reject_qty numeric(14,0),
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- Lot bahan yang digunakan oleh batch (traceability)
create table batch_materials (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references production_batches(id),
  lot_id uuid not null references raw_material_lots(id),
  qty numeric(14,3) not null check (qty > 0),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table qc_checks (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references production_batches(id),
  lot_id uuid references raw_material_lots(id),    -- QC bahan masuk
  check_type text not null check (check_type in ('incoming', 'in_process', 'final')),
  parameters jsonb not null default '{}'::jsonb,   -- cth: {"berat_tablet_mg":502,"pH":3.8}
  passed boolean not null,
  coa_url text,
  checked_by uuid references auth.users(id) default auth.uid(),
  checked_at timestamptz not null default now(),
  check (batch_id is not null or lot_id is not null)
);

-- Deposit gate: bahan tidak boleh dikeluarkan sebelum deposit diterima
create or replace function batches_guard() returns trigger language plpgsql as $$
declare js job_status;
begin
  if new.stage is distinct from old.stage then
    select status into js from job_orders where id = new.job_order_id;
    if new.stage <> 'planned' and js not in ('confirmed', 'scheduled', 'in_production', 'qc', 'ready') then
      raise exception 'Job order belum confirmed (status: %). Deposit mesti diterima dahulu.', js;
    end if;

    insert into batch_stage_logs (batch_id, from_stage, to_stage, good_qty, reject_qty)
    values (new.id, old.stage, new.stage, new.good_qty, new.reject_qty);

    if new.stage = 'material_issued' and new.actual_start is null then
      new.actual_start := now();
    end if;
    if new.stage in ('released', 'rejected') then
      new.actual_end := coalesce(new.actual_end, now());
    end if;
    if new.stage = 'released' then
      new.manufacture_date := coalesce(new.manufacture_date, current_date);
      new.expiry_date := coalesce(new.expiry_date, (
        select (new.manufacture_date + make_interval(months => p.shelf_life_months))::date
        from job_orders j join products p on p.id = j.product_id where j.id = new.job_order_id));
    end if;

    -- Status job order ikut batch
    if new.stage in ('material_issued', 'processing', 'forming', 'packing') then
      update job_orders set status = 'in_production', updated_at = now()
       where id = new.job_order_id and status in ('confirmed', 'scheduled');
    elsif new.stage = 'qc' then
      update job_orders set status = 'qc', updated_at = now()
       where id = new.job_order_id and status = 'in_production';
    elsif new.stage = 'released' then
      -- Semua kuantiti sudah released → job order 'ready' (sedia invois baki & hantar)
      update job_orders j set status = 'ready', updated_at = now()
       where j.id = new.job_order_id and j.status in ('in_production', 'qc')
         and new.good_qty + coalesce((select sum(good_qty) from production_batches
               where job_order_id = new.job_order_id and stage = 'released' and id <> new.id), 0) >= j.quantity;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger batches_guard before update on production_batches
  for each row execute function batches_guard();

-- Keluarkan bahan: tolak stok lot + rekod pergerakan
create or replace function batch_materials_issue() returns trigger language plpgsql as $$
declare l raw_material_lots%rowtype; js job_status;
begin
  select j.status into js from production_batches b join job_orders j on j.id = b.job_order_id where b.id = new.batch_id;
  if js not in ('confirmed', 'scheduled', 'in_production') then
    raise exception 'Job order belum confirmed (status: %). Deposit mesti diterima dahulu.', js;
  end if;

  select * into l from raw_material_lots where id = new.lot_id for update;
  if l.status <> 'released' then
    raise exception 'Lot % belum lulus QC (status: %)', l.lot_no, l.status;
  end if;
  if l.expiry_date is not null and l.expiry_date < current_date then
    raise exception 'Lot % telah luput (%)', l.lot_no, l.expiry_date;
  end if;
  if l.remaining_qty < new.qty then
    raise exception 'Stok lot % tidak cukup: baki %, diminta %', l.lot_no, l.remaining_qty, new.qty;
  end if;

  update raw_material_lots
     set remaining_qty = remaining_qty - new.qty,
         status = case when remaining_qty - new.qty = 0 then 'depleted'::lot_status else status end
   where id = l.id;

  insert into stock_movements (lot_id, raw_material_id, type, qty, ref_table, ref_id)
  values (l.id, l.raw_material_id, 'issue', -new.qty, 'batch_materials', new.id);
  return new;
end $$;
create trigger batch_materials_issue before insert on batch_materials
  for each row execute function batch_materials_issue();

-- ─────────────────────────────────────────────────────────────
-- Invois & bayaran
-- ─────────────────────────────────────────────────────────────
create sequence invoice_seq;
create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique not null default ('INV' || to_char(now(), 'YYMM') || '-' || lpad(nextval('invoice_seq')::text, 4, '0')),
  client_id uuid not null references clients(id),
  job_order_id uuid references job_orders(id),
  type invoice_type not null,
  amount numeric(14,2) not null check (amount > 0),
  amount_paid numeric(14,2) not null default 0,
  issue_date date not null default current_date,
  due_date date,
  status invoice_status not null default 'draft',
  gateway text,
  gateway_bill_id text,
  payment_url text,
  einvoice_uuid text,                         -- MyInvois (Fasa 3)
  einvoice_status text,
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  amount numeric(14,2) not null check (amount > 0),
  method text not null default 'gateway' check (method in ('gateway', 'bank_transfer', 'cash', 'other')),
  gateway text,
  gateway_ref text,
  status payment_status not null default 'success',
  paid_at timestamptz not null default now(),
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (gateway, gateway_ref)
);

-- Bayaran berjaya: kemas kini invois; deposit penuh → job order confirmed
create or replace function payments_apply() returns trigger language plpgsql security definer set search_path = public as $$
declare inv invoices%rowtype; paid numeric(14,2);
begin
  if new.status <> 'success' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'success' then return new; end if;

  select coalesce(sum(amount), 0) into paid from payments where invoice_id = new.invoice_id and status = 'success';
  update invoices
     set amount_paid = paid,
         status = case when paid >= amount then 'paid'::invoice_status else 'partially_paid'::invoice_status end
   where id = new.invoice_id
  returning * into inv;

  if inv.type in ('deposit', 'full') and inv.status = 'paid' and inv.job_order_id is not null then
    update job_orders
       set status = 'confirmed', deposit_paid_at = coalesce(deposit_paid_at, new.paid_at), updated_at = now()
     where id = inv.job_order_id and status in ('draft', 'awaiting_deposit');
  end if;
  return new;
end $$;
create trigger payments_apply after insert or update of status on payments
  for each row execute function payments_apply();

-- ─────────────────────────────────────────────────────────────
-- Views
-- ─────────────────────────────────────────────────────────────
create view v_raw_material_stock with (security_invoker = true) as
select m.id, m.code, m.name, m.category, m.uom, m.reorder_level,
       coalesce(sum(l.remaining_qty) filter (where l.status = 'released' and (l.expiry_date is null or l.expiry_date >= current_date)), 0) as available_qty,
       coalesce(sum(l.remaining_qty) filter (where l.status = 'quarantine'), 0) as quarantine_qty,
       min(l.expiry_date) filter (where l.status = 'released' and l.remaining_qty > 0) as next_expiry,
       coalesce(sum(l.remaining_qty) filter (where l.status = 'released' and (l.expiry_date is null or l.expiry_date >= current_date)), 0) <= m.reorder_level as below_reorder
from raw_materials m
left join raw_material_lots l on l.raw_material_id = m.id
group by m.id;

create view v_job_order_progress with (security_invoker = true) as
select j.id, j.jo_no, j.client_id, c.name as client_name, j.product_id, p.name as product_name, p.form,
       j.quantity, j.status, j.promised_date, j.total_amount, j.deposit_amount, j.deposit_paid_at,
       coalesce(sum(b.good_qty) filter (where b.stage = 'released'), 0) as released_qty,
       count(b.id) as batch_count,
       round(100.0 * coalesce(sum(b.good_qty) filter (where b.stage = 'released'), 0) / j.quantity, 1) as percent_done,
       (j.promised_date is not null and j.promised_date < current_date
        and j.status not in ('delivered', 'completed', 'cancelled')) as is_late
from job_orders j
join clients c on c.id = j.client_id
join products p on p.id = j.product_id
left join production_batches b on b.job_order_id = j.id
group by j.id, c.name, p.name, p.form;

create view v_receivables_aging with (security_invoker = true) as
select i.client_id, c.name as client_name,
       sum(i.amount - i.amount_paid) as outstanding,
       sum(i.amount - i.amount_paid) filter (where coalesce(i.due_date, i.issue_date) >= current_date) as not_due,
       sum(i.amount - i.amount_paid) filter (where current_date - coalesce(i.due_date, i.issue_date) between 1 and 30) as d1_30,
       sum(i.amount - i.amount_paid) filter (where current_date - coalesce(i.due_date, i.issue_date) between 31 and 60) as d31_60,
       sum(i.amount - i.amount_paid) filter (where current_date - coalesce(i.due_date, i.issue_date) between 61 and 90) as d61_90,
       sum(i.amount - i.amount_paid) filter (where current_date - coalesce(i.due_date, i.issue_date) > 90) as d90_plus
from invoices i
join clients c on c.id = i.client_id
where i.status in ('issued', 'partially_paid')
group by i.client_id, c.name;

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- Staf: akses penuh data operasi. Client: baca data syarikat sendiri sahaja.
-- ─────────────────────────────────────────────────────────────
create or replace function is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role <> 'client')
$$;
create or replace function my_client_id() returns uuid language sql stable security definer set search_path = public as $$
  select client_id from profiles where id = auth.uid()
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'profiles', 'suppliers', 'products', 'raw_materials', 'bom_items',
    'raw_material_lots', 'stock_movements', 'production_lines', 'job_orders',
    'production_batches', 'batch_stage_logs', 'batch_materials', 'qc_checks',
    'invoices', 'payments'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy staff_all on %I for all using (is_staff()) with check (is_staff())', t);
  end loop;
end $$;

create policy own_profile on profiles for select using (id = auth.uid());
create policy client_read on clients for select using (id = my_client_id());
create policy client_read on products for select using (client_id = my_client_id());
create policy client_read on job_orders for select using (client_id = my_client_id());
create policy client_read on invoices for select using (client_id = my_client_id());
create policy client_read on payments for select
  using (exists (select 1 from invoices i where i.id = invoice_id and i.client_id = my_client_id()));
create policy client_read on production_batches for select
  using (exists (select 1 from job_orders j where j.id = job_order_id and j.client_id = my_client_id()));
create policy client_read on qc_checks for select
  using (check_type = 'final' and exists (
    select 1 from production_batches b join job_orders j on j.id = b.job_order_id
    where b.id = batch_id and j.client_id = my_client_id()));

-- Pengguna baru: profil role 'client' tanpa client_id (tiada akses) sehingga admin tetapkan role/client
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
