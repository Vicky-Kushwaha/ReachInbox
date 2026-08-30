"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, RefreshCw } from "lucide-react";

export interface FilterOption {
  value: string;
  label: string;
}

export default function TopBar({
  query,
  onQueryChange,
  filterOptions,
  activeFilter,
  onFilterChange,
  onRefresh,
  refreshing,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  filterOptions: FilterOption[];
  activeFilter: string;
  onFilterChange: (v: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [filterOpen, setFilterOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-6 py-3">
      <div className="relative flex-1">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search"
          className="w-full rounded-full bg-slate-100 py-2 pl-9 pr-4 text-sm outline-none placeholder:text-slate-400 focus:bg-slate-50 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="relative">
        <button
          onClick={() => setFilterOpen((o) => !o)}
          className={`rounded-lg p-2 hover:bg-slate-100 ${activeFilter !== "all" ? "text-brand-600" : "text-slate-400"}`}
          title="Filter"
        >
          <SlidersHorizontal size={17} />
        </button>
        {filterOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-popover">
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onFilterChange(opt.value);
                  setFilterOpen(false);
                }}
                className={`flex w-full items-center px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  activeFilter === opt.value ? "font-medium text-brand-600" : "text-slate-600"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onRefresh}
        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
        title="Refresh"
      >
        <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
      </button>
    </div>
  );
}
