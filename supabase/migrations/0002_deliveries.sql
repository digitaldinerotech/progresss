-- Progresss: Delivery Order (penghantaran barang siap kepada client)

create sequence if not exists delivery_seq;
create table deliveries (
  id uuid primary key default gen_random_uuid(),
  do_no text unique not null default ('DO' || to_char(now(), 'YYMM') || '-' || lpad(nextval('delivery_seq')::text, 4, '0')),
  job_order_id uuid not null references job_orders(id),
  qty numeric(14,0) not null check (qty > 0),
  delivered_on date not null default current_date,
  recipient text,                              -- nama penerima
  carrier text,                                -- kurier / kenderaan sendiri / client ambil
  tracking_no text,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table deliveries enable row level security;
create policy staff_all on deliveries for all using (is_staff()) with check (is_staff());
create policy client_read on deliveries for select
  using (exists (select 1 from job_orders j where j.id = job_order_id and j.client_id = my_client_id()));

-- Tidak boleh hantar lebih dari kuantiti lulus QC.
-- Semua kuantiti lulus sudah dihantar (dan tiada batch lagi dalam proses) → job order 'delivered'.
create or replace function deliveries_after_insert() returns trigger language plpgsql as $$
declare delivered numeric; released numeric;
begin
  select coalesce(sum(qty), 0) into delivered from deliveries where job_order_id = new.job_order_id;
  select coalesce(sum(good_qty), 0) into released from production_batches
   where job_order_id = new.job_order_id and stage = 'released';
  if delivered > released then
    raise exception 'Kuantiti dihantar (%) melebihi kuantiti lulus QC (%)', delivered, released;
  end if;
  update job_orders set status = 'delivered', updated_at = now()
   where id = new.job_order_id and status in ('in_production', 'qc', 'ready')
     and delivered >= released
     and not exists (select 1 from production_batches b
                      where b.job_order_id = new.job_order_id and b.stage not in ('released', 'rejected'));
  return new;
end $$;
create trigger deliveries_after_insert after insert on deliveries
  for each row execute function deliveries_after_insert();
