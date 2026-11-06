/**
 * رسومات TruePrice ثلاثية الأبعاد (SVG أصلية وخفيفة).
 *
 * - كل التدرجات معرّفة مرة واحدة في <IllustrationDefs /> داخل layout،
 *   والرسومات تشير إليها عبر url(#tp-...) فلا تتكرر في الصفحة.
 * - الإحساس ثلاثي الأبعاد يأتي من: وجه أمامي متدرج + وجه جانبي أغمق
 *   + لمعة بيضاء + ظل أرضي ناعم (بدون فلاتر ثقيلة).
 * - كلها زخرفية (aria-hidden) ولا تحمل بيانات.
 */

type Props = { className?: string };

const svgProps = {
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": true,
  focusable: false,
} as const;

function Shadow({ cx = 60, cy = 108, rx = 34, ry = 6 }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#tp-shadow)" />;
}

/* =========================================================
   التدرجات المشتركة
========================================================= */

export function IllustrationDefs() {
  const lin = (id: string, a: string, b: string, x2 = 0, y2 = 1) => (
    <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
      <stop offset="0" stopColor={a} />
      <stop offset="1" stopColor={b} />
    </linearGradient>
  );

  return (
    <svg width="0" height="0" style={{ position: "absolute" }} {...svgProps}>
      <defs>
        {lin("tp-mint", "#a6f5d0", "#26b97c")}
        {lin("tp-mint-side", "#1f9e69", "#137049")}
        {lin("tp-forest", "#2d8063", "#0c3b2c")}
        {lin("tp-forest-side", "#0a2c21", "#071f17")}
        {lin("tp-yellow", "#ffeeb0", "#f5b52f")}
        {lin("tp-yellow-side", "#e39d1e", "#bf7a0c")}
        {lin("tp-coral", "#ffb7a2", "#f2603e")}
        {lin("tp-coral-side", "#d84c2c", "#a9361c")}
        {lin("tp-cream", "#fffdf7", "#f1dfba")}
        {lin("tp-cream-side", "#e6d0a5", "#cdb17c")}
        {lin("tp-white", "#ffffff", "#e3eee7")}
        {lin("tp-screen", "#174536", "#0a281f")}
        {lin("tp-hl", "#ffffff", "#ffffff00")}
        <radialGradient id="tp-glass" cx="0.38" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#f2fff9" stopOpacity="0.95" />
          <stop offset="0.6" stopColor="#a7f3d0" stopOpacity="0.55" />
          <stop offset="1" stopColor="#3ddc97" stopOpacity="0.35" />
        </radialGradient>
        <radialGradient id="tp-shadow">
          <stop offset="0" stopColor="#0b2a21" stopOpacity="0.28" />
          <stop offset="1" stopColor="#0b2a21" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="tp-blob-mint" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#d6faea" />
          <stop offset="1" stopColor="#a7f3d0" />
        </radialGradient>
        <radialGradient id="tp-blob-yellow" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#fff8dc" />
          <stop offset="1" stopColor="#ffe28f" />
        </radialGradient>
        <radialGradient id="tp-blob-coral" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#fff0ea" />
          <stop offset="1" stopColor="#ffc3b1" />
        </radialGradient>
        <radialGradient id="tp-blob-cream" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="1" stopColor="#f6e3bd" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/* =========================================================
   رسومات الهوية
========================================================= */

/** بطاقة سعر */
export function PriceTag3D({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...svgProps}>
      <Shadow cy={106} rx={36} />
      <g transform="rotate(-14 60 64)">
        <path d="M36 37h50q9 0 9 9v36q0 9-9 9H36L15 64Z" fill="url(#tp-yellow-side)" transform="translate(4 5)" />
        <path d="M36 37h50q9 0 9 9v36q0 9-9 9H36L15 64Z" fill="url(#tp-yellow)" />
        <path d="M36 39h48" stroke="#fff" strokeOpacity=".7" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="33" cy="64" r="6" fill="#0c3b2c" />
        <circle cx="33" cy="64" r="3.4" fill="#fff8e1" />
        <rect x="48" y="53" width="34" height="6" rx="3" fill="#0c3b2c" opacity=".85" />
        <rect x="48" y="65" width="22" height="5" rx="2.5" fill="#0c3b2c" opacity=".35" />
        <circle cx="80" cy="76" r="7" fill="url(#tp-mint)" />
        <path d="m76.8 76 2.2 2.2 4.2-4.4" fill="none" stroke="#0c3b2c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M27 62c-10-8-10-26 4-34" fill="none" stroke="#0c3b2c" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** عدسة بحث */
export function Magnifier3D({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...svgProps}>
      <Shadow cx={62} cy={108} rx={34} />
      <g transform="rotate(45 79 79)">
        <rect x="71" y="68" width="16" height="40" rx="8" fill="url(#tp-coral-side)" transform="translate(2 2)" />
        <rect x="71" y="68" width="16" height="40" rx="8" fill="url(#tp-coral)" />
        <rect x="74" y="72" width="4" height="28" rx="2" fill="#fff" opacity=".45" />
      </g>
      <circle cx="51" cy="51" r="30" fill="url(#tp-forest-side)" transform="translate(2 3)" />
      <circle cx="51" cy="51" r="30" fill="url(#tp-forest)" />
      <circle cx="51" cy="51" r="22" fill="url(#tp-glass)" />
      <path d="M36 44a17 17 0 0 1 13-11" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".9" />
      <path d="M41 58l7-7 5 5 9-10" fill="none" stroke="#0c3b2c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity=".75" />
    </svg>
  );
}

/** عربة تسوق */
export function Cart3D({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...svgProps}>
      <Shadow cy={107} rx={40} />
      <path d="M12 26h12l4 8" fill="none" stroke="#0c3b2c" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="44" y="20" width="26" height="22" rx="4" fill="url(#tp-yellow)" transform="rotate(-10 57 31)" />
      <rect x="62" y="24" width="22" height="20" rx="4" fill="url(#tp-coral)" transform="rotate(8 73 34)" />
      <path d="M28 38h78l-10 38q-2 6-8 6H42q-6 0-8-6Z" fill="url(#tp-mint-side)" transform="translate(3 4)" />
      <path d="M28 38h78l-10 38q-2 6-8 6H42q-6 0-8-6Z" fill="url(#tp-mint)" />
      <path d="M45 46v28M60 46v28M75 46v28M90 46l-3 28M32 56h70M35 66h64" stroke="#fff" strokeOpacity=".55" strokeWidth="2.2" />
      <path d="M38 82l-4 8h62" fill="none" stroke="#0c3b2c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="44" cy="98" r="7" fill="#0c3b2c" />
      <circle cx="44" cy="98" r="2.6" fill="#fff3dc" />
      <circle cx="86" cy="98" r="7" fill="#0c3b2c" />
      <circle cx="86" cy="98" r="2.6" fill="#fff3dc" />
    </svg>
  );
}

/** هاتف ذكي يعرض رسمًا سعريًا */
export function Phone3D({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...svgProps}>
      <Shadow cy={110} rx={30} />
      <rect x="35" y="10" width="52" height="96" rx="12" fill="url(#tp-forest-side)" transform="translate(5 3)" />
      <rect x="35" y="10" width="52" height="96" rx="12" fill="url(#tp-forest)" />
      <rect x="39" y="15" width="44" height="86" rx="9" fill="url(#tp-screen)" />
      <rect x="54" y="18" width="14" height="4" rx="2" fill="#0a221a" />
      <rect x="44" y="30" width="22" height="5" rx="2.5" fill="#a7f3d0" opacity=".85" />
      <rect x="44" y="39" width="14" height="4" rx="2" fill="#a7f3d0" opacity=".35" />
      <path d="M44 74l9-9 7 6 14-15" fill="none" stroke="#3ddc97" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="74" cy="56" r="3" fill="#ffd66b" />
      <rect x="44" y="84" width="34" height="9" rx="4.5" fill="url(#tp-mint)" />
      <path d="M38 22v40" stroke="#fff" strokeOpacity=".25" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** رسم بياني صاعد */
export function Chart3D({ className = "" }: Props) {
  const bar = (x: number, h: number, front: string, side: string, top: string) => {
    const base = 96;
    const y = base - h;
    return (
      <g>
        <path d={`M${x + 18} ${y}l8 -5v${h}l-8 5Z`} fill={side} />
        <path d={`M${x} ${y}l8 -5h18l-8 5Z`} fill={top} />
        <rect x={x} y={y} width="18" height={h} fill={front} />
      </g>
    );
  };
  return (
    <svg viewBox="0 0 120 120" className={className} {...svgProps}>
      <Shadow cy={104} rx={44} />
      {bar(18, 30, "url(#tp-yellow)", "url(#tp-yellow-side)", "#fff2c2")}
      {bar(46, 46, "url(#tp-coral)", "url(#tp-coral-side)", "#ffd2c4")}
      {bar(74, 64, "url(#tp-mint)", "url(#tp-mint-side)", "#d3f9e8")}
      <path d="M14 58l26-14 20 8 34-28" fill="none" stroke="#0c3b2c" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M84 20h12v12" fill="none" stroke="#0c3b2c" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** عملات */
export function Coins3D({ className = "" }: Props) {
  const coin = (cx: number, cy: number) => (
    <g>
      <path d={`M${cx - 22} ${cy}v8a22 8 0 0 0 44 0v-8`} fill="url(#tp-yellow-side)" />
      <ellipse cx={cx} cy={cy} rx="22" ry="8" fill="url(#tp-yellow)" />
      <ellipse cx={cx} cy={cy} rx="14" ry="4.6" fill="none" stroke="#c98a14" strokeWidth="1.6" opacity=".7" />
    </g>
  );
  return (
    <svg viewBox="0 0 120 120" className={className} {...svgProps}>
      <Shadow cy={104} rx={42} />
      {coin(48, 88)}
      {coin(48, 76)}
      {coin(48, 64)}
      {coin(80, 92)}
      {coin(80, 80)}
      <g transform="rotate(-18 82 46)">
        <path d="M60 46v6a22 22 0 0 0 44 0v-6" fill="url(#tp-yellow-side)" />
        <ellipse cx="82" cy="46" rx="22" ry="20" fill="url(#tp-yellow)" />
        <ellipse cx="82" cy="46" rx="15" ry="13.5" fill="none" stroke="#c98a14" strokeWidth="2" opacity=".7" />
        <path d="M82 37l2.6 5.6 6 .7-4.5 4 1.3 6-5.4-3-5.4 3 1.3-6-4.5-4 6-.7Z" fill="#c98a14" opacity=".85" />
        <path d="M68 38a16 14 0 0 1 9-6" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity=".8" />
      </g>
    </svg>
  );
}

/** صناديق منتجات */
export function Boxes3D({ className = "" }: Props) {
  const cube = (x: number, y: number, s: number, tape: string) => (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M0 ${s * 0.3}L${s * 0.5} 0L${s} ${s * 0.3}L${s * 0.5} ${s * 0.6}Z`} fill="url(#tp-cream)" />
      <path d={`M0 ${s * 0.3}L${s * 0.5} ${s * 0.6}V${s * 1.2}L0 ${s * 0.9}Z`} fill="#f3e3c0" />
      <path d={`M${s} ${s * 0.3}L${s * 0.5} ${s * 0.6}V${s * 1.2}L${s} ${s * 0.9}Z`} fill="url(#tp-cream-side)" />
      <path d={`M${s * 0.25} ${s * 0.15}L${s * 0.75} ${s * 0.45}`} stroke={tape} strokeWidth={s * 0.12} />
      <path d={`M${s * 0.75} ${s * 0.45}V${s * 1.05}`} stroke={tape} strokeWidth={s * 0.12} opacity=".85" />
    </g>
  );
  return (
    <svg viewBox="0 0 120 120" className={className} {...svgProps}>
      <Shadow cy={106} rx={46} />
      {cube(10, 52, 48, "#3ddc97")}
      {cube(58, 44, 54, "#ff7a59")}
      {cube(36, 14, 40, "#ffd66b")}
    </svg>
  );
}

/** سيارة */
export function Car3D({ className = "", tone = "coral" }: Props & { tone?: "coral" | "mint" }) {
  const body = tone === "coral" ? "url(#tp-coral)" : "url(#tp-mint)";
  const side = tone === "coral" ? "url(#tp-coral-side)" : "url(#tp-mint-side)";
  return (
    <svg viewBox="0 0 140 100" className={className} {...svgProps}>
      <ellipse cx="70" cy="88" rx="58" ry="6" fill="url(#tp-shadow)" />
      <path d="M14 66q0-12 12-14l14-3 14-16q4-4 10-4h26q7 0 11 5l12 15 14 3q11 2 11 13v6q0 5-5 5H19q-5 0-5-5Z" fill={side} transform="translate(0 4)" />
      <path d="M14 66q0-12 12-14l14-3 14-16q4-4 10-4h26q7 0 11 5l12 15 14 3q11 2 11 13v6q0 5-5 5H19q-5 0-5-5Z" fill={body} />
      <path d="M48 49l10-12q2-2 5-2h12v14Z" fill="url(#tp-glass)" />
      <path d="M80 35h9q4 0 6 3l9 11H80Z" fill="url(#tp-glass)" />
      <path d="M30 56h82" stroke="#fff" strokeOpacity=".5" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="116" y="60" width="9" height="5" rx="2.5" fill="#fff3dc" />
      <rect x="16" y="62" width="7" height="4" rx="2" fill="#ffd66b" />
      {[40, 102].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="80" r="12" fill="#0c3b2c" />
          <circle cx={cx} cy="80" r="6" fill="url(#tp-white)" />
          <circle cx={cx} cy="80" r="2" fill="#0c3b2c" />
        </g>
      ))}
    </svg>
  );
}

/** مفتاح سيارة */
export function CarKey3D({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...svgProps}>
      <Shadow cy={106} rx={30} />
      <circle cx="60" cy="24" r="13" fill="none" stroke="url(#tp-yellow)" strokeWidth="6" />
      <g transform="rotate(-8 60 66)">
        <rect x="38" y="36" width="44" height="64" rx="18" fill="url(#tp-forest-side)" transform="translate(4 4)" />
        <rect x="38" y="36" width="44" height="64" rx="18" fill="url(#tp-forest)" />
        <circle cx="60" cy="56" r="7" fill="url(#tp-mint)" />
        <circle cx="60" cy="76" r="5" fill="#ffd66b" />
        <circle cx="60" cy="89" r="4" fill="#ff7a59" />
        <path d="M44 48q2-6 8-7" fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** ميزان (المنهجية / المقارنة) */
export function Scale3D({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...svgProps}>
      <Shadow cy={108} rx={34} />
      <rect x="40" y="94" width="40" height="10" rx="5" fill="url(#tp-forest)" />
      <rect x="56" y="30" width="8" height="66" rx="4" fill="url(#tp-forest)" />
      <path d="M22 38h76" stroke="#0c3b2c" strokeWidth="5" strokeLinecap="round" />
      <circle cx="60" cy="30" r="7" fill="url(#tp-yellow)" />
      <path d="M26 40l-12 26M26 40l12 26M94 40l-12 22M94 40l12 22" stroke="#0c3b2c" strokeWidth="1.8" opacity=".6" />
      <path d="M10 66h32a16 9 0 0 1-32 0Z" fill="url(#tp-mint)" />
      <path d="M78 62h32a16 9 0 0 1-32 0Z" fill="url(#tp-coral)" />
    </svg>
  );
}

/* =========================================================
   رسومات الفئات (بديل صادق لصور المنتجات)
========================================================= */

function CatTablet({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...svgProps}>
      <Shadow cy={104} rx={40} />
      <rect x="22" y="18" width="76" height="84" rx="10" fill="url(#tp-forest-side)" transform="translate(4 3)" />
      <rect x="22" y="18" width="76" height="84" rx="10" fill="url(#tp-forest)" />
      <rect x="27" y="23" width="66" height="74" rx="6" fill="url(#tp-screen)" />
      <rect x="33" y="30" width="24" height="18" rx="4" fill="url(#tp-mint)" />
      <rect x="61" y="30" width="26" height="18" rx="4" fill="url(#tp-yellow)" />
      <rect x="33" y="52" width="54" height="18" rx="4" fill="url(#tp-coral)" opacity=".9" />
      <rect x="33" y="76" width="30" height="5" rx="2.5" fill="#a7f3d0" opacity=".5" />
    </svg>
  );
}

function CatLaptop({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...svgProps}>
      <Shadow cy={100} rx={50} />
      <rect x="22" y="26" width="76" height="52" rx="7" fill="url(#tp-forest)" />
      <rect x="27" y="31" width="66" height="42" rx="4" fill="url(#tp-screen)" />
      <path d="M33 62l11-10 9 6 14-14 9 7" fill="none" stroke="#3ddc97" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 82h96l-8 10H20Z" fill="url(#tp-cream-side)" />
      <path d="M14 78h92q4 0 2 4H12q-2-4 2-4Z" fill="url(#tp-cream)" />
      <rect x="50" y="79" width="20" height="2.5" rx="1.25" fill="#cdb17c" />
    </svg>
  );
}

function CatWatch({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...svgProps}>
      <Shadow cy={108} rx={26} />
      <rect x="44" y="6" width="32" height="34" rx="8" fill="url(#tp-coral)" />
      <rect x="44" y="80" width="32" height="30" rx="8" fill="url(#tp-coral-side)" />
      <rect x="32" y="30" width="56" height="60" rx="16" fill="url(#tp-forest-side)" transform="translate(3 3)" />
      <rect x="32" y="30" width="56" height="60" rx="16" fill="url(#tp-forest)" />
      <rect x="38" y="36" width="44" height="48" rx="11" fill="url(#tp-screen)" />
      <circle cx="60" cy="60" r="14" fill="none" stroke="#2f6d55" strokeWidth="4" />
      <path d="M60 46a14 14 0 0 1 13 19" fill="none" stroke="#3ddc97" strokeWidth="4" strokeLinecap="round" />
      <rect x="88" y="52" width="5" height="14" rx="2.5" fill="url(#tp-yellow)" />
    </svg>
  );
}

function CatHeadphones({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...svgProps}>
      <Shadow cy={106} rx={42} />
      <path d="M24 70V58a36 36 0 0 1 72 0v12" fill="none" stroke="url(#tp-forest)" strokeWidth="9" strokeLinecap="round" />
      {[18, 80].map((x) => (
        <g key={x}>
          <rect x={x} y="60" width="22" height="38" rx="11" fill="url(#tp-mint-side)" transform="translate(2 2)" />
          <rect x={x} y="60" width="22" height="38" rx="11" fill="url(#tp-mint)" />
          <rect x={x + 6} y="66" width="4" height="22" rx="2" fill="#fff" opacity=".5" />
        </g>
      ))}
    </svg>
  );
}

function CatGamepad({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...svgProps}>
      <Shadow cy={98} rx={46} />
      <path d="M30 40h60q18 0 22 22l3 16q2 14-10 14-8 0-14-10l-4-6H33l-4 6q-6 10-14 10-12 0-10-14l3-16q4-22 22-22Z" fill="url(#tp-coral-side)" transform="translate(0 4)" />
      <path d="M30 40h60q18 0 22 22l3 16q2 14-10 14-8 0-14-10l-4-6H33l-4 6q-6 10-14 10-12 0-10-14l3-16q4-22 22-22Z" fill="url(#tp-coral)" />
      <path d="M30 54h14M37 47v14" stroke="#0c3b2c" strokeWidth="5" strokeLinecap="round" />
      <circle cx="82" cy="50" r="4.5" fill="#ffd66b" />
      <circle cx="92" cy="58" r="4.5" fill="#3ddc97" />
      <circle cx="72" cy="58" r="4.5" fill="#fff3dc" />
      <path d="M36 44h40" stroke="#fff" strokeOpacity=".5" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function CatTV({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...svgProps}>
      <Shadow cy={104} rx={44} />
      <rect x="12" y="20" width="96" height="62" rx="7" fill="url(#tp-forest-side)" transform="translate(4 3)" />
      <rect x="12" y="20" width="96" height="62" rx="7" fill="url(#tp-forest)" />
      <rect x="17" y="25" width="86" height="52" rx="4" fill="url(#tp-screen)" />
      <circle cx="78" cy="42" r="9" fill="url(#tp-yellow)" />
      <path d="M17 77l26-24 16 14 14-10 30 20Z" fill="url(#tp-mint)" opacity=".9" />
      <path d="M50 86h20l4 12H46Z" fill="url(#tp-cream-side)" />
      <rect x="38" y="96" width="44" height="5" rx="2.5" fill="url(#tp-cream)" />
    </svg>
  );
}

function CatBox({ className = "" }: Props) {
  return <Boxes3D className={className} />;
}

const CATEGORY_ART: Record<
  string,
  { Art: (p: Props) => React.JSX.Element; blob: string }
> = {
  Smartphones: { Art: Phone3D, blob: "url(#tp-blob-mint)" },
  Tablets: { Art: CatTablet, blob: "url(#tp-blob-yellow)" },
  Laptops: { Art: CatLaptop, blob: "url(#tp-blob-cream)" },
  Smartwatches: { Art: CatWatch, blob: "url(#tp-blob-coral)" },
  Audio: { Art: CatHeadphones, blob: "url(#tp-blob-mint)" },
  Gaming: { Art: CatGamepad, blob: "url(#tp-blob-yellow)" },
  TV: { Art: CatTV, blob: "url(#tp-blob-cream)" },
};

/** رسم توضيحي للفئة مع خلفية دائرية ناعمة */
export function CategoryArt({
  category,
  className = "",
}: {
  category: string;
  className?: string;
}) {
  const { Art, blob } = CATEGORY_ART[category] ?? { Art: CatBox, blob: "url(#tp-blob-cream)" };
  return (
    <div className={`relative ${className}`} aria-hidden>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" {...svgProps}>
        <path
          d="M50 6c20 0 40 12 43 32 3 21-8 42-28 50-19 8-44 3-55-15C-1 55 4 30 18 17 26 10 38 6 50 6Z"
          fill={blob}
        />
      </svg>
      <Art className="relative size-full p-[10%]" />
    </div>
  );
}
