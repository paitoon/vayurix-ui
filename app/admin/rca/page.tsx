"use client";

// RCA policy: when a failure becomes a case, and how much of the log the model is allowed to read.
//
// Its own screen, beside SLA policies, because it answers the same kind of question — "what does this
// system consider worth acting on" — rather than "how is this deployment wired up". The SLA cadence
// knobs live on the SLA screen for the same reason.

import { Banner } from "../../lib/ui";
import { Page } from "../../shell";
import { SettingsCard } from "../settings/editor";

export default function RcaPolicyPage() {
  return (
    <Page
      crumbs={[{ label: "Home", href: "/" }, { label: "Admin" }, { label: "RCA policy" }]}
      title="RCA policy"
      intro="What opens a case, and how much evidence the model is given to explain it."
    >
      <SettingsCard
        title="Thresholds"
        prefix="rca_policy"
        only={["rca_policy.retry_notify_threshold", "rca_policy.max_evidence_chars"]}
      />

      <Banner tone="info">
        A failed run always opens a case; the retry threshold only decides how many retries a task may
        burn first. Deadlines and their cadence are on <b>SLA policies</b>.
      </Banner>
    </Page>
  );
}
