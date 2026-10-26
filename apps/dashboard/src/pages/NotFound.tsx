import { Link } from "react-router-dom";

/**
 * Shown for an unknown URL.
 *
 * The catch-all route used to silently redirect to the dashboard, so a
 * mistyped address or a stale bookmark looked like the link had worked and
 * quietly taken you somewhere else.
 */
export function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center p-6">
      <div className="max-w-md text-center">
        <div className="text-5xl font-black text-gray-200">404</div>
        <h1 className="mt-3 text-xl font-bold text-gray-900">We couldn't find that page</h1>
        <p className="mt-2 text-sm text-gray-500">
          The link may be out of date, or the page may have moved.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/" className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110">
            Go to dashboard
          </Link>
          <Link to="/help" className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200">
            Get help
          </Link>
        </div>
      </div>
    </div>
  );
}
