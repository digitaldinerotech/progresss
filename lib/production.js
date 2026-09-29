// Logik pengeluaran tulen (tiada akses DB) supaya mudah diuji.

const round3 = n => Math.round(n * 1000) / 1000

// Keperluan bahan untuk `qty` unit produk: qty × qty_per_unit × (1 + wastage%)
export function materialRequirements(bomItems, qty) {
  return bomItems.map(b => ({
    raw_material_id: b.raw_material_id,
    name: b.raw_materials?.name,
    uom: b.raw_materials?.uom,
    required: round3(Number(qty) * Number(b.qty_per_unit) * (1 + Number(b.wastage_percent || 0) / 100)),
  }))
}

// Bandingkan keperluan dengan stok tersedia (v_raw_material_stock)
export function materialCheck(requirements, stockRows) {
  const available = Object.fromEntries(stockRows.map(s => [s.id, Number(s.available_qty)]))
  return requirements.map(r => {
    const have = available[r.raw_material_id] || 0
    return { ...r, available: have, shortfall: round3(Math.max(0, r.required - have)) }
  })
}

// FEFO: agih keperluan kepada lot 'released' yang belum luput, tarikh luput paling awal dahulu.
// Pulangkan { allocations: [{lot_id, qty, ...}], shortages: [{raw_material_id, missing}] }
export function allocateFefo(requirements, lots, onDate = new Date().toISOString().slice(0, 10)) {
  const usable = lots
    .filter(l => l.status === 'released' && Number(l.remaining_qty) > 0 && (!l.expiry_date || l.expiry_date >= onDate))
    .sort((a, b) => (a.expiry_date || '9999-12-31').localeCompare(b.expiry_date || '9999-12-31')
      || String(a.received_at || '').localeCompare(String(b.received_at || '')))

  const allocations = []
  const shortages = []
  for (const r of requirements) {
    let need = r.required
    for (const lot of usable.filter(l => l.raw_material_id === r.raw_material_id)) {
      if (need <= 0) break
      const take = round3(Math.min(need, Number(lot.remaining_qty)))
      if (take <= 0) continue
      allocations.push({ lot_id: lot.id, lot_no: lot.lot_no, raw_material_id: r.raw_material_id, name: r.name, uom: r.uom, expiry_date: lot.expiry_date, qty: take })
      need = round3(need - take)
    }
    if (need > 0) shortages.push({ raw_material_id: r.raw_material_id, name: r.name, uom: r.uom, missing: need })
  }
  return { allocations, shortages }
}

// Peringkat seterusnya bagi batch (QC diputuskan di halaman QC)
export const NEXT_STAGE = {
  planned: 'material_issued',
  material_issued: 'processing',
  processing: 'forming',
  forming: 'packing',
  packing: 'qc',
}
