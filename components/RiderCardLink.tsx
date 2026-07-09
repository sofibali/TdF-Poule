"use client";

import { useEffect, useState } from "react";
import { EGG_CHANCE, riderEgg, type Egg } from "@/lib/data/rider-eggs";

/**
 * Full-card link wrapper with Easter egg support.
 * Wraps any rider card — tapping the card goes to the letour.fr rider page,
 * but for egg riders it sometimes detours to the gag instead (~50% of clicks).
 * Image eggs pop up as a lightbox; other eggs open in a new tab.
 */
export default function RiderCardLink({
  href,
  name,
  className,
  children,
}: {
  href: string | null;
  name: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [egg, setEgg] = useState<Egg | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const e = riderEgg(name);
    setEgg(e && Math.random() < EGG_CHANCE ? e : null);
  }, [name]);

  const dest = egg?.url ?? href;

  if (!dest) {
    return <div className={className}>{children}</div>;
  }

  if (egg?.image) {
    return (
      <>
        <a
          href={egg.url}
          className={className}
          onClick={(ev) => {
            ev.preventDefault();
            setShow(true);
          }}
        >
          {children}
        </a>
        {show && (
          <div
            className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-6"
            onClick={() => setShow(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={egg.url}
              alt={egg.label}
              className="max-h-[85vh] max-w-[90vw] rounded-xl shadow-2xl"
            />
          </div>
        )}
      </>
    );
  }

  return (
    <a href={dest} target="_blank" rel="noreferrer noopener" className={className}>
      {children}
    </a>
  );
}
