import { ArrowUp, ArrowDown } from "react-feather";
import { useState } from "react";

/* ───────── single log item ───────── */

function Event({ event, timestamp }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isClient = event.event_id && !event.event_id.startsWith("event_");

  return (
    <div className="flex flex-col gap-2 p-2 rounded-md bg-gray-50">
      {/* header row */}
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        {isClient ? (
          <ArrowDown className="text-blue-400" />
        ) : (
          <ArrowUp className="text-green-400" />
        )}
        <span className="text-sm text-gray-500">
          {isClient ? "client:" : "server:"}&nbsp;{event.type} | {timestamp}
        </span>
      </div>

      {/* payload */}
      {isExpanded && (
        <div className="text-gray-500 bg-gray-200 p-2 rounded-md overflow-x-auto">
          <pre className="text-xs whitespace-pre-wrap break-all">
            {JSON.stringify(event, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ───────── event log list ───────── */

export default function EventLog({ events }) {
  const elements = [];
  const seenDelta = new Set(); // show max-one delta per type per render

  events.forEach((event, idx) => {
    if (event.type.endsWith("delta")) {
      if (seenDelta.has(event.type)) return;
      seenDelta.add(event.type);
    }

    // key = event_id + idx  → always unique, no React warning
    elements.push(
      <Event
        key={`${event.event_id}-${idx}`}
        event={event}
        timestamp={event.timestamp}
      />
    );
  });

  return (
    <div className="flex flex-col gap-2 overflow-x-auto">
      {elements.length === 0 ? (
        <div className="text-gray-500">Awaiting events…</div>
      ) : (
        elements
      )}
    </div>
  );
}
