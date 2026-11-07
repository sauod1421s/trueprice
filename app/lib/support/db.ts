/**
 * طلبات التواصل من جهة الموقع العام: كل شيء عبر دوال pub في القاعدة (web_reader)،
 * فلا يقرأ الموقع العام أي جدول طلبات مباشرة.
 */
import "server-only";
import { withPublic, withPublicWrite } from "../db/pool";
import type { ContactInput } from "./validate";

export type SiteContact = { email: string | null; whatsapp: string | null };

export async function siteContact(): Promise<SiteContact> {
  return withPublic(async (c) => {
    const r = await c.query<{ email: string | null; whatsapp: string | null }>(`select email, whatsapp from pub.site_contact`);
    return { email: r.rows[0]?.email ?? null, whatsapp: r.rows[0]?.whatsapp ?? null };
  });
}

export async function submitContactRequest(ip: string, v: ContactInput): Promise<{ reference: string; trackingCode: string }> {
  return withPublicWrite(async (c) => {
    const r = await c.query<{ reference: string; tracking_code: string }>(
      `select reference, tracking_code from pub.submit_contact_request($1, $2, $3, $4, $5, $6, $7, $8)`,
      [ip, v.kind, v.name, v.email, v.phone, v.subject, v.message, v.relatedRef]
    );
    return { reference: r.rows[0].reference, trackingCode: r.rows[0].tracking_code };
  });
}

export type TrackedRequest = {
  reference: string;
  kind: string;
  status: string;
  subject: string;
  createdAt: string;
  updatedAt: string;
  replies: { body: string; at: string }[];
};

export async function trackContactRequest(ip: string, reference: string, code: string): Promise<TrackedRequest | null> {
  return withPublicWrite(async (c) => {
    const r = await c.query<{
      reference: string; kind: string; status: string; subject: string; created_at: Date; updated_at: Date;
      replies: { body: string; at: string }[];
    }>(`select * from pub.track_contact_request($1, $2, $3)`, [ip, reference, code]);
    const x = r.rows[0];
    if (!x) return null;
    return {
      reference: x.reference, kind: x.kind, status: x.status, subject: x.subject,
      createdAt: x.created_at.toISOString(), updatedAt: x.updated_at.toISOString(), replies: x.replies ?? [],
    };
  });
}
