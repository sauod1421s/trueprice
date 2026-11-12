/**
 * سجل الموصّلات وحالة جاهزية كل مصدر.
 * المصدر يعمل فقط إذا: معتمد + مسموح له بالاستيراد الآلي (allow_automated) + له موصّل + إعداداته كاملة.
 */
import { amazonCreatorsConnector } from "./amazonCreators";
import { feedUrlConnector } from "./feedUrl";
import type { Connector, ConnectorSource, Env } from "./types";

export const CONNECTORS: readonly Connector[] = [amazonCreatorsConnector, feedUrlConnector];

export function connectorFor(source: ConnectorSource): Connector | null {
  return CONNECTORS.find((c) => c.appliesTo(source)) ?? null;
}

export type Readiness =
  | { ready: true; connector: Connector }
  | { ready: false; connector: Connector | null; reason: string; missing?: string[] };

export function readiness(source: ConnectorSource, env: Env): Readiness {
  const connector = connectorFor(source);
  if (!connector) return { ready: false, connector, reason: "لا يوجد موصّل لهذا النوع من المصادر (رفع يدوي فقط)" };
  if (source.status !== "approved") return { ready: false, connector, reason: "المصدر غير معتمد بعد" };
  if (!source.allowAutomated) {
    return { ready: false, connector, reason: "لم يُسمح للمصدر بالجلب الآلي (يُفعَّل بعد التأكد من إذن المصدر بالوصول البرمجي)" };
  }
  const missing = connector.missingConfig(source, env);
  if (missing.length) return { ready: false, connector, reason: "إعدادات الخادم ناقصة", missing };
  return { ready: true, connector };
}
