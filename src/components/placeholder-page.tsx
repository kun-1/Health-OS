export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="surface-card p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase text-teal-800">Record Layer</p>
      <h1 className="mt-3 text-[32px] font-bold leading-tight text-[#17201c]">{title}</h1>
      <div className="mt-8 rounded-lg border border-[rgba(38,55,49,0.10)] bg-white/65 p-5">
        <h2 className="text-lg font-bold text-[#17201c]">Empty State</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5d6963]">{description}</p>
      </div>
    </section>
  );
}
