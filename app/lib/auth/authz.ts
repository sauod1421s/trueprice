/**
 * صلاحيات لوحة الإدارة — الرفض هو الافتراضي.
 *
 * هذه الوحدة لا تحتوي نظام دخول ولا تخزين؛ هي قواعد التفويض التي يجب أن
 * تمر بها كل عملية حفظ على الخادم عندما يُعتمد التخزين الدائم.
 * حتى ذلك الحين لا يوجد مصدر هوية، لذلك كل طلب حفظ يُرفض.
 *
 * القاعدة (حسب توثيق Next.js لأمان البيانات): التحقق داخل كل Server Action
 * أو Route Handler نفسه، لا الاعتماد على حماية الصفحة أو proxy وحدهما.
 */

export type Role = "admin" | "reviewer" | "viewer";

export type Permission =
  | "import:preview"
  | "import:commit"
  | "store:approve_alias"
  | "price:verify"
  | "price:reject"
  | "catalog:edit"
  | "user:manage";

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = Object.freeze({
  viewer: ["import:preview"],
  reviewer: ["import:preview", "price:verify", "price:reject"],
  admin: ["import:preview", "import:commit", "store:approve_alias", "price:verify", "price:reject", "catalog:edit", "user:manage"],
});

/** صلاحيات حساسة تتطلب تحققًا ثنائيًا في الجلسة */
export const MFA_REQUIRED: ReadonlySet<Permission> = new Set(["import:commit", "store:approve_alias", "catalog:edit", "user:manage"]);

/** هوية المستخدم كما يقدمها نظام الدخول على الخادم (لا تُقبل من المتصفح) */
export type Principal = {
  userId: string;
  roles: readonly string[];
  mfa: boolean;
  /** UTC ISO */
  sessionExpiresAt: string;
};

export type AuthzContext = {
  /** الوقت الحالي UTC ISO — يُمرر صراحة */
  now: string;
  /** من أنشأ السجل المستهدف (لمنع توثيق المستخدم لأسعار رفعها بنفسه) */
  resourceCreatedBy?: string;
};

export type AuthzDecision =
  | { allowed: true }
  | { allowed: false; reason: "unauthenticated" | "session_expired" | "forbidden" | "mfa_required" | "self_review" };

const KNOWN_ROLES = new Set<string>(Object.keys(ROLE_PERMISSIONS));

export function permissionsOf(roles: readonly string[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of roles) {
    if (!KNOWN_ROLES.has(r)) continue; // الأدوار غير المعروفة لا تمنح شيئًا
    for (const p of ROLE_PERMISSIONS[r as Role]) out.add(p);
  }
  return out;
}

export function authorize(principal: Principal | null | undefined, permission: Permission, ctx: AuthzContext): AuthzDecision {
  if (!principal || !principal.userId) return { allowed: false, reason: "unauthenticated" };
  const exp = Date.parse(principal.sessionExpiresAt);
  const now = Date.parse(ctx.now);
  if (!Number.isFinite(exp) || !Number.isFinite(now) || exp <= now) return { allowed: false, reason: "session_expired" };
  if (!permissionsOf(principal.roles).has(permission)) return { allowed: false, reason: "forbidden" };
  if (MFA_REQUIRED.has(permission) && !principal.mfa) return { allowed: false, reason: "mfa_required" };
  // مبدأ العينين: من رفع السعر لا يوثقه أو يرفضه بنفسه
  if ((permission === "price:verify" || permission === "price:reject") && ctx.resourceCreatedBy && ctx.resourceCreatedBy === principal.userId) {
    return { allowed: false, reason: "self_review" };
  }
  return { allowed: true };
}

export class AuthorizationError extends Error {
  constructor(public readonly reason: Exclude<AuthzDecision, { allowed: true }>["reason"]) {
    super(`not authorized: ${reason}`);
    this.name = "AuthorizationError";
  }
}

export function assertAuthorized(principal: Principal | null | undefined, permission: Permission, ctx: AuthzContext): asserts principal is Principal {
  const d = authorize(principal, permission, ctx);
  if (!d.allowed) throw new AuthorizationError(d.reason);
}

/**
 * مصدر الهوية على الخادم. لا يوجد نظام دخول بعد، لذلك يعيد null دائمًا،
 * وبالتالي كل عملية محمية تُرفض. يُستبدل عند اعتماد نظام الدخول.
 */
export type PrincipalResolver = () => Promise<Principal | null>;
export const noIdentityProvider: PrincipalResolver = async () => null;

/**
 * غلاف لكل عملية حفظ مستقبلية (Server Action / Route Handler):
 * يجلب الهوية من الخادم ويتحقق من الصلاحية قبل تنفيذ أي شيء.
 */
export function withPermission<A extends unknown[], R>(
  permission: Permission,
  handler: (principal: Principal, ...args: A) => Promise<R>,
  options: { resolve?: PrincipalResolver; now?: () => string; createdBy?: (...args: A) => string | undefined } = {}
): (...args: A) => Promise<R> {
  const resolve = options.resolve ?? noIdentityProvider;
  const now = options.now ?? (() => new Date().toISOString());
  return async (...args: A) => {
    const principal = await resolve();
    assertAuthorized(principal, permission, { now: now(), resourceCreatedBy: options.createdBy?.(...args) });
    return handler(principal, ...args);
  };
}
