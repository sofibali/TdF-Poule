"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="text-6xl">🚲💨</div>
      <h2 className="mt-4 text-2xl font-bold text-slate-800">
        Flat tyre on the road!
      </h2>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        Something went wrong loading this page. The peloton is working on it.
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
