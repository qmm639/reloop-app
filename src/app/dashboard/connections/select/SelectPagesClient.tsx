"use client";

import { useState } from "react";
import Link from "next/link";

interface PageItem {
  id: string;
  name: string;
  instagramId?: string | null;
  instagramUsername?: string | null;
}

export function SelectPagesClient({
  provider,
  items,
}: {
  provider: "facebook" | "instagram";
  items: PageItem[];
}) {
  const isIg = provider === "instagram";
  const [selectedIds, setSelectedIds] = useState<string[]>(
    items.map((item) => (isIg ? item.instagramId! : item.id))
  );

  const toggleItem = (val: string) => {
    setSelectedIds((prev) =>
      prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]
    );
  };

  const selectAll = () => {
    setSelectedIds(items.map((item) => (isIg ? item.instagramId! : item.id)));
  };

  const deselectAll = () => {
    setSelectedIds([]);
  };

  return (
    <form action="/api/connect/meta/confirm" method="POST" className="grid" style={{ gap: 20 }}>
      <input type="hidden" name="provider" value={provider} />

      <div className="spread" style={{ padding: "8px 0" }}>
        <span className="muted" style={{ fontSize: 14 }}>
          เลือกแล้ว <b>{selectedIds.length}</b> จากทั้งหมด {items.length} บัญชี
        </span>
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-line"
            style={{ minHeight: 34, padding: "0 12px", fontSize: 13 }}
            onClick={selectAll}
          >
            เลือกทั้งหมด
          </button>
          <button
            type="button"
            className="btn btn-line"
            style={{ minHeight: 34, padding: "0 12px", fontSize: 13 }}
            onClick={deselectAll}
          >
            ล้างการเลือก
          </button>
        </div>
      </div>

      <div className="grid" style={{ gap: 12 }}>
        {items.map((item) => {
          const val = isIg ? item.instagramId! : item.id;
          const checked = selectedIds.includes(val);
          const displayName = isIg
            ? item.instagramUsername
              ? `@${item.instagramUsername} (${item.name})`
              : `Instagram ของเพจ ${item.name}`
            : item.name;

          return (
            <label
              key={val}
              className="card row"
              style={{
                cursor: "pointer",
                padding: "16px 20px",
                border: checked ? "2px solid var(--accent)" : "1px solid var(--line)",
                background: checked ? "color-mix(in srgb, var(--accent) 5%, var(--surface))" : "var(--surface)",
                transition: "all 0.15s ease",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                name="selectedIds"
                value={val}
                checked={checked}
                onChange={() => toggleItem(val)}
                style={{ width: 20, height: 20, accentColor: "var(--accent)", cursor: "pointer" }}
              />

              <div
                className="chip"
                style={{
                  background: isIg ? "#C1358A" : "#1B6FD6",
                  width: 36,
                  height: 36,
                  fontSize: 14,
                }}
              >
                {isIg ? "IG" : "FB"}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 15, display: "block", color: "var(--ink)" }}>{displayName}</b>
                <div className="row" style={{ gap: 8, marginTop: 4 }}>
                  <span className="mono muted" style={{ fontSize: 12 }}>ID: {val}</span>
                  {isIg && (
                    <span className="pill ok" style={{ fontSize: 11, padding: "1px 8px" }}>
                      ผูกกับเพจ {item.name}
                    </span>
                  )}
                  {!isIg && item.instagramId && (
                    <span className="pill ok" style={{ fontSize: 11, padding: "1px 8px" }}>
                      มี Instagram ผูกอยู่
                    </span>
                  )}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      <div className="row" style={{ gap: 12, marginTop: 8 }}>
        <button
          type="submit"
          className="btn btn-main"
          disabled={selectedIds.length === 0}
          style={{ minWidth: 200 }}
        >
          ยืนยันการเชื่อมต่อ ({selectedIds.length} บัญชี)
        </button>
        <Link className="btn btn-line" href="/dashboard/connections">
          ยกเลิก
        </Link>
      </div>
    </form>
  );
}
