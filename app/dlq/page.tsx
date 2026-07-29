"use client";

// Dead letters: messages the pipeline gave up on after three attempts. Two actions, both
// consequential, so each row shows the error and the payload before you choose.
//
// Replay re-publishes to the original topic; discard admits it will never process. Neither is
// reversible, which is why the payload is one click away rather than hidden behind a "details" page.

import { Inbox, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, listOf, relTime, statusTone, type DeadLetter, type Json } from "../lib/api";
import { Card, Empty, Pill, Resource, useFlash, useResource } from "../lib/ui";
import { Page } from "../shell";

export default function DlqPage() {
  const state = useResource(async () => listOf<DeadLetter>(await api.get("/dlq")), [], 20_000);
  const { flash, show } = useFlash();
  const [payload, setPayload] = useState<{ id: number; body: Json } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const act = async (id: number, action: "replay" | "discard") => {
    setBusy(id);
    try {
      await api.post(`/dlq/${id}/${action}`);
      show("ok", action === "replay" ? `Message ${id} re-published to its topic.` : `Message ${id} discarded.`);
      await state.reload();
    } catch (e) {
      show("bad", (e as Error).message);
    }
    setBusy(null);
  };

  const inspect = async (id: number) => {
    try {
      setPayload({ id, body: await api.get<Json>(`/dlq/${id}`) });
    } catch (e) {
      show("bad", (e as Error).message);
    }
  };

  return (
    <Page
      crumbs={[{ label: "Operate", href: "/" }, { label: "Dead letters" }]}
      title="Dead letters"
      intro="Messages the pipeline could not process after three attempts. Fix the cause, then replay."
    >
      {flash}
      <Resource state={state} label="Loading dead letters…">
        {rows => (
          <>
            <Card meta={`${rows.length} parked`} tight>
              {rows.length === 0 ? (
                <Empty>
                  <Inbox size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                  Nothing parked — the pipeline is keeping up.
                </Empty>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>status</th>
                      <th>topic</th>
                      <th>key</th>
                      <th>error</th>
                      <th className="num">attempts</th>
                      <th>received</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(m => (
                      <tr key={m.id}>
                        <td>
                          <Pill tone={statusTone(m.status)}>{m.status}</Pill>
                        </td>
                        <td className="mono">{m.source_topic}</td>
                        <td className="trunc mono">{m.msg_key ?? "—"}</td>
                        <td className="trunc" style={{ color: "var(--red)" }}>
                          {m.error ?? "—"}
                        </td>
                        <td className="num">{m.attempts}</td>
                        <td>{relTime(m.received_at)}</td>
                        <td className="actions">
                          <button className="btn btn-sm" onClick={() => void inspect(m.id)}>
                            Payload
                          </button>
                          <button
                            className="btn btn-sm"
                            disabled={busy === m.id}
                            onClick={() => void act(m.id, "replay")}
                          >
                            <RotateCcw size={12} />
                            Replay
                          </button>
                          <button
                            className="btn btn-sm"
                            data-tone="danger"
                            disabled={busy === m.id}
                            onClick={() => {
                              if (confirm(`Discard message ${m.id}? It will never be processed.`)) {
                                void act(m.id, "discard");
                              }
                            }}
                          >
                            <Trash2 size={12} />
                            Discard
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            {payload && (
              <Card
                title={`Dead letter #${payload.id}`}
                actions={
                  <button className="btn btn-sm" data-tone="ghost" onClick={() => setPayload(null)}>
                    Close
                  </button>
                }
              >
                <pre className="evidence">{JSON.stringify(payload.body, null, 2)}</pre>
              </Card>
            )}
          </>
        )}
      </Resource>
    </Page>
  );
}
