/** توحيد معرّفات المنتج قبل حفظها (منطق خالص — يُختبر وحده) */
import { normalizeGtin, normalizeMpn } from "../ingest/fields";

const STORE_SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;

export function normalizeIdentifier(kind: "gtin" | "mpn" | "store_sku", raw: string): string | null {
  if (kind === "gtin") return normalizeGtin(raw);
  if (kind === "mpn") {
    const m = normalizeMpn(raw);
    return m && /^[A-Z0-9]{3,64}$/.test(m) ? m : null;
  }
  const v = raw.trim().toUpperCase();
  return STORE_SKU.test(v) ? v : null;
}
