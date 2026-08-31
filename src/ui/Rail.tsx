import { NavLink } from "react-router";

const destinations = [
  { to: "/", label: "Archive", end: true },
  { to: "/workbench", label: "Workbench", end: false },
  { to: "/taste", label: "Taste", end: false },
];

export function Rail() {
  return (
    <nav
      aria-label="Primary"
      className="flex flex-col gap-4 border-b border-hairline pb-4 lg:w-auto lg:gap-1 lg:border-b-0 lg:border-r-0 lg:pb-0 lg:pr-8"
    >
      <p className="font-serif text-[length:var(--text-item)] text-ink">GoToTheArchive</p>
      <div className="flex flex-row gap-5 overflow-x-auto lg:flex-col lg:gap-1">
        {destinations.map((d) => (
          <NavLink
            key={d.to}
            to={d.to}
            end={d.end}
            className={({ isActive }) =>
              `shrink-0 border-b-2 pb-1 font-sans text-[length:var(--text-body)] transition-colors duration-[var(--duration-fast)] lg:border-b-0 lg:border-l-2 lg:px-3 lg:py-1.5 lg:pb-1.5 ${
                isActive ? "border-accent text-ink" : "border-transparent text-stone hover:text-ink"
              }`
            }
          >
            {d.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
