"use client";

import { useEffect, useState } from "react";

import { EGG_CHANCE, riderEgg, type Egg } from "@/lib/data/rider-eggs";

/**
 * Renders a rider name as a link — but ~half the time on an "egg" rider it
 * detours to the gag instead of `href`. Image eggs (family pics) pop up in a
 * click-to-dismiss lightbox; other eggs open in a new tab. The egg is rolled on
 * the client (after mount) so the server/client markup matches.
 */
export default function EggOrLink({
  name,
  href,
  className,
  children,
}: {
  name: string;
  href: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const [egg, setEgg] = useState<Egg | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const e = riderEgg(name);
    setEgg(e && Math.random() < EGG_CHANCE ? e : null);
  }, [name]);

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

  const dest = egg?.url ?? href;
  if (dest) {
    return (
      <a href={dest} target="_blank" rel="noreferrer noopener" className={className}>
        {children}
      </a>
    );
  }
  return <span className={className}>{children}</span>;
}
