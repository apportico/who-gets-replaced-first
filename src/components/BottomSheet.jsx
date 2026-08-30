import { useState } from 'react';

// Spec 0008 R1. Below `md` the three-column desktop layout cannot work: the
// sidebar is 288px and the detail panel 384px, both fixed, so at 375px the map
// column is a remainder of zero — measured at 0 x 448 before this change. The
// map becomes full-bleed and these panels move into a sheet over it.
//
// The `md:contents` trick is what keeps this to one DOM tree: on desktop the
// wrapper is removed from the box tree entirely, so its children participate in
// the parent flex row exactly as they did before. Rendering two trees would
// mean two Leaflet instances, and R1's whole point is the one map.
//
// Three snap positions rather than free dragging: free drag needs pointer
// capture and inertia to feel right, and none of that is reachable by keyboard.
// A button that cycles peek -> half -> full is operable by touch, mouse and
// keyboard with the same code, which is what R2 needs anyway.

const POSITIONS = [
  { key: 'peek', label: 'Peek', className: 'h-[4.5rem]' },
  { key: 'half', label: 'Half', className: 'h-[50vh]' },
  { key: 'full', label: 'Full', className: 'h-[88vh]' },
];

export default function BottomSheet({ title, children }) {
  const [index, setIndex] = useState(0);
  const position = POSITIONS[index];
  const cycle = () => setIndex((i) => (i + 1) % POSITIONS.length);

  return (
    <div
      className={`
        md:contents
        fixed inset-x-0 bottom-0 z-[1000]
        flex flex-col
        bg-white border-t border-gray-200 rounded-t-xl shadow-[0_-4px_24px_rgba(0,0,0,0.12)]
        transition-[height] duration-200
        ${position.className}
      `}
    >
      {/* The handle is hidden on desktop along with the sheet behaviour, because
          md:contents removes the wrapper but not its children. */}
      <button
        onClick={cycle}
        aria-expanded={index > 0}
        aria-label={`${title}. Currently ${position.label}. Activate to expand.`}
        className="md:hidden flex-shrink-0 w-full min-h-[44px] flex flex-col items-center justify-center gap-1 cursor-pointer"
      >
        <span aria-hidden="true" className="w-10 h-1 rounded-full bg-gray-300" />
        <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
          {title}
        </span>
      </button>
      <div className="md:contents flex-1 min-h-0 overflow-y-auto panel-scroll">
        {children}
      </div>
    </div>
  );
}
