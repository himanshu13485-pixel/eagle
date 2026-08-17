import { PageHeader } from "../components/Layout";

export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="grid place-items-center rounded-2xl border border-dashed border-gray-300 bg-white py-24 text-center">
        <div className="max-w-md">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-brand/10 text-brand">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 8v4l3 2M12 22a10 10 0 100-20 10 10 0 000 20z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-800">Coming soon</h3>
          <p className="mt-2 text-sm text-gray-500">{note}</p>
        </div>
      </div>
    </div>
  );
}
