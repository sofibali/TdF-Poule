"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="text-5xl">🔧</div>
      <h2 className="mt-4 text-xl font-bold text-slate-800">
        Mechanical issue!
      </h2>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        {error.message || "Something went wrong in the admin area."}
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-full bg-yellow-400 px-6 py-2.5 text-sm font-bold text-slate-900 shadow-md hover:bg-yellow-300 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
