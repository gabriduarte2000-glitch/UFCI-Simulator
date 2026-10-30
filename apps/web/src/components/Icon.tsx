const P: Record<string, string> = {
  more: "M5 12h.01M12 12h.01M19 12h.01",
  cursor: "M5 3l13 7-6 2 4 7-3 1.5-4-7-4 4z",
  hand: "M8 12V6a1.5 1.5 0 013 0v5m0-6a1.5 1.5 0 013 0v6m0-4.5a1.5 1.5 0 013 0V15c0 4-2.5 6-6 6-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 012.5-1.5L8 14",
  undo: "M9 7H5v4M5 7l3.5-3.5M5 7c2-1.5 6-2 9 0s4 6 1 9",
  redo: "M15 7h4v4M19 7l-3.5-3.5M19 7c-2-1.5-6-2-9 0s-4 6-1 9",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6",
  minus: "M6 12h12",
  plus: "M6 12h12M12 6v12",
  fit: "M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4",
  grid: "M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16",
  value: "M4 8h16M4 16h16M9 5l-1 14M16 5l-1 14",
  play: "M7 4l13 8-13 8z",
  pause: "M7 4h4v16H7zM13 4h4v16h-4z",
  stop: "M6 6h12v12H6z",
  restart: "M5 12a7 7 0 107-7M5 5v5h5",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  open: "M3 7h6l2 2h10v10H3z",
  save: "M5 4h12l3 3v13H5zM8 4v6h8V4M8 20v-6h8v6",
  search: "M10.5 17a6.5 6.5 0 100-13 6.5 6.5 0 000 13zM16 16l5 5",
  chevron: "M7 10l5 5 5-5",
  chevronUp: "M7 14l5-5 5 5",
  warn: "M12 4l9 16H3zM12 10v4M12 17v.5",
  err: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 8v5M12 16v.5",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  copy: "M8 8h11v12H8zM5 16V4h11",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5v.5",
  close: "M6 6l12 12M18 6L6 18",
  panelLeft: "M4 5h16v14H4zM9 5v14M15 10l-2 2 2 2",
  panelRight: "M4 5h16v14H4zM15 5v14M9 10l2 2-2 2",
  note: "M5 4h14v11l-5 5H5zM14 20v-5h5",
  duplicate: "M8 8h11v12H8zM5 16V4h11",
  help: "M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.5a2.5 2.5 0 115 0c0 1.8-2.5 2-2.5 4M12 17v.5",
  sliders: "M5 6h14M5 12h14M5 18h14M9 4v4M15 10v4M8 16v4",
  dash: "M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z",
  chartLine: "M4 4v16h16M7 15l4-5 3 3 5-7",
  table: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14",
  gauge: "M4 17a8 8 0 1116 0M12 17l4-6",
  build: "M4 6h6v5H4zM14 13h6v5h-6zM10 8.5h2.5a1.5 1.5 0 011.5 1.5v3",
  book: "M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h10",
};

export function Icon({ name, size = 16 }: { name: keyof typeof P | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] ?? ""} />
    </svg>
  );
}
