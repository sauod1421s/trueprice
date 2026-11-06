/** حالة التحميل لصفحة البحث: هيكل خفيف بنفس شكل النتائج */
export default function Loading() {
  return (
    <main aria-busy="true" aria-label="جارٍ تحميل نتائج البحث">
      <section className="theme-forest bg-hero">
        <div className="container-page py-8 sm:py-12">
          <div className="h-8 w-48 rounded-lg bg-white/10" />
          <div className="mt-3 h-4 w-64 rounded bg-white/10" />
          <div className="mt-5 h-14 max-w-3xl rounded-2xl bg-white/90" />
          <div className="mt-4 flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-9 w-20 rounded-full bg-white/10" />
            ))}
          </div>
        </div>
      </section>
      <section className="container-page py-6 sm:py-8">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="card overflow-hidden">
              <div className="skeleton h-36 rounded-none" />
              <div className="space-y-3 p-4">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-1/2" />
                <div className="skeleton h-14 w-full" />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
