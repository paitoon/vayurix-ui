// What each setting means, in one line, in the words an operator would use.
//
// Kept beside the screen rather than shipped from the API: this is interface copy, and it changes
// for reasons ("nobody understood that sentence") that have nothing to do with the backend. A key
// with no entry simply shows no help, so adding a setting never breaks this file.

export const HELP: Record<string, string> = {
  // ---- app
  "app.name": "Label for this deployment, shown in the console header. Give prod and staging different names.",
  "app.timezone": "IANA zone used for log timestamps and the `_local` fields in API responses. Empty = UTC. Stored data stays UTC.",

  // ---- worker
  "worker.heartbeat_interval_sec": "How often each worker records that it is alive. The supervisor checks at the same cadence.",
  "worker.stale_after_sec": "A worker silent for longer than this is treated as hung and restarted. Keep it several heartbeats long to avoid false alarms.",
  "worker.shutdown_grace_sec": "Seconds a worker gets to leave its Kafka group cleanly after SIGTERM before being killed outright.",

  // ---- agent
  "agent.llm": "Which model backend performs root-cause analysis. Pick openai_compat for any vendor speaking the OpenAI /chat/completions shape — that covers OpenAI, Groq, Together, OpenRouter, vLLM and local servers without a code change. Takes effect when the workers restart: the client is built once at startup, not per analysis.",

  // ---- anthropic
  "anthropic.base_url": "API root. Change only for a proxy or a regional endpoint. The key is ANTHROPIC_API_KEY in .env.",
  "anthropic.model": "Model id, e.g. claude-sonnet-5.",
  "anthropic.api_version": "Date-versioned API contract (the anthropic-version header), not a client version. Change only when Anthropic retires the one in use.",
  "anthropic.max_tokens": "Required by the Messages API, and your per-analysis cost ceiling. Too low truncates the answer mid-sentence, which arrives as a parse failure.",

  // ---- openai_compat
  "openai_compat.base_url": "Root URL without the path, e.g. https://api.groq.com/openai/v1. Any server accepting OpenAI-shaped chat requests works here.",
  "openai_compat.chat_path": "Appended to the base URL. Almost always /chat/completions; separate because some deployments mount it elsewhere.",
  "openai_compat.model": "Model id as that provider names it.",
  "openai_compat.auth_style": "How the key is sent: bearer = Authorization: Bearer, api_key = an api-key header (Azure style), none = no auth, for a local server.",
  "openai_compat.api_key_env": "Name of the environment variable holding the key — not the key itself. Lets you point at any provider without a new hardcoded variable name, and keeps the secret out of the database.",
  "openai_compat.max_tokens": "0 omits the field entirely, which some servers require. Otherwise a cost ceiling per analysis.",
  "openai_compat.json_mode": "Ask the server to constrain output to valid JSON. Far more reliable than asking in the prompt — turn it off only for a provider that rejects the field, and expect occasional parse failures afterwards.",
  "openai_compat.text_embedding_base_url": "Root URL of the embedding server, without the path, e.g. http://host:8003/v1. Separate from the chat base URL: the embedding server is often not the chat server.",
  "openai_compat.text_embedding_path": "Appended to that URL. Almost always /embeddings.",
  "openai_compat.text_embedding_model": "Embedding model id as that server names it (GET /v1/models lists them), e.g. nomic-embed-text.",
  "openai_compat.text_embedding_auth_style": "How the key is sent: bearer = Authorization: Bearer, api_key = an api-key header, none = no auth.",
  "openai_compat.text_embedding_api_key_env": "Name of the environment variable holding the embedding key — not the key itself. Set it in .env and restart.",
  "openai_compat.text_embedding_dimensions": "Vector width to request. 0 = do not send the field, which a model without Matryoshka support (e.g. nomic-embed-text on vLLM) requires. Whatever the model returns must match the `vector(n)` columns in the database.",

  // ---- embedding
  "embedding.provider": "Which backend produces embeddings for search and duplicate detection. openai_compat covers any server with an OpenAI-shaped /embeddings — OpenAI, vLLM, TEI, LiteLLM. Changing this after data exists mixes vector spaces and breaks similarity — re-embed if you switch.",
  "embedding.max_chars": "Characters of text sent per embedding request. Longer inputs cost more and get truncated by the model anyway.",
  "embedding.batch_size": "Texts per embedding request. Larger batches mean fewer round trips and more memory on the model server.",
  "embedding.max_retries": "Extra attempts after a transient embedding failure before giving up on that batch. Applies to every provider.",
  "embedding.backoff_base_sec": "Base delay for those retries; it doubles each attempt.",
  "embedding.circuit_fail_threshold": "Consecutive failures that trip the breaker, after which requests fail fast instead of piling up. 0 disables it.",
  "embedding.circuit_reset_sec": "How long the breaker stays open before one request is allowed through to test recovery.",

  // ---- azure_openai
  "azure_openai.chat_deployment": "Name of the Azure deployment (not the model name) used for analysis.",
  "azure_openai.chat_api_version": "Azure REST API version for chat. Change only when Azure retires the one in use.",
  "azure_openai.chat_endpoint": "Base URL of the Azure resource serving the chat deployment.",
  "azure_openai.text_embedding_endpoint": "Base URL for embeddings. Usually the same resource as chat.",
  "azure_openai.text_embedding_model": "Embedding deployment/model name, e.g. text-embedding-3-small.",
  "azure_openai.text_embedding_dimensions": "Vector width requested from Azure. Must match the `vector(n)` columns in the database.",
  "azure_openai.text_embedding_api_version": "Azure REST API version for embedding requests. Separate from chat's so the two can move independently.",
  "azure_openai.text_embedding_api_key_env": "Name of the environment variable holding the embedding key — not the key itself. If it is unset or empty, AZURE_OPENAI_CHAT_API_KEY is used.",

  // ---- ollama
  "ollama.ollama_base_url": "Where the Ollama chat server is. From inside a container this is the host IP, not localhost.",
  "ollama.chat_model": "Model tag used for analysis, e.g. gpt-oss:20b. It must already be pulled on that server.",
  "ollama.text_embedding_model": "Model tag used for embeddings, e.g. nomic-embed-text. Its dimensionality is fixed by the model.",
  "ollama.text_embedding_base_url": "Where the Ollama server for embeddings is, e.g. http://host:11434 — the root only; /api/embed is appended. May be a different machine from the chat server.",

  // ---- airflow
  "airflow.base_url": "Airflow REST API root, including the version, e.g. http://host:8080/api/v2.",
  "airflow.username": "Airflow user used to read logs and task state. Its password is AIRFLOW_PASSWORD in .env.",
  "airflow.log_max_wait_sec": "How long to keep waiting for a task log that Airflow has not finished writing.",
  "airflow.log_poll_sec": "Gap between those attempts.",
  "airflow.lineage_resync_hours": "How often asset lineage is re-read into the graph. 0 = at startup and on demand only.",
  "airflow.reconcile_interval_min": "With event_source = both, how often to ask Airflow for events (failures, retries, finished runs) it never told us about. Airflow callbacks are best-effort — a pod killed before its callback runs, or a lost POST, would otherwise be invisible.",
  "airflow.reconcile_lookback_min": "How far back each of those passes looks. Keep it several intervals wide so a missed pass or a restart still gets covered.",
  "airflow.reconcile_max_per_pass": "Ceiling on task instances examined per pass, so a wide window cannot turn into a scan of Airflow's whole history.",
  "airflow.event_source": "How vayurix learns what each DAG did. both (recommended) = DAG callbacks (vayurix_callbacks.py) for speed, plus polling the Airflow API for anything a callback lost. callback = callbacks only; a lost callback is a lost event. poll = Airflow API only, so a DAG needs no callback code at all.",
  "airflow.poll_interval_sec": "Polling interval when event_source = poll. It is the detection delay, since polling is then the only way events arrive. Takes effect on restart.",
  "airflow.poll_grace_sec": "With event_source = both, anything that finished less than this long ago is left to its callback, so the callback's version, with the real exception text, is the one that gets recorded.",

  // ---- k8s
  "k8s.enabled": "Read pod status and events from Kubernetes when a task fails. Only useful if Airflow runs on Kubernetes — it explains the failures a task log cannot: OOM kills, pods that were never scheduled, missing images.",
  "k8s.api_url": "API server root. Inside the cluster this is https://kubernetes.default.svc; outside it, whatever address the API server is published on.",
  "k8s.namespace": "The one namespace worker pods run in. Also the limit of what the token is allowed to read, so keep it narrow.",
  "k8s.ca_path": "PEM certificate authority used to verify the API server. Empty falls back to the system trust store, which almost never works for a self-hosted cluster.",
  "k8s.token_path": "Where to read the ServiceAccount token when K8S_TOKEN is not set in .env. The path shown is the standard in-cluster one.",
  "k8s.event_limit": "Events kept per pod. They are already scoped to one pod, so this only caps something stuck in a long back-off loop.",
  "k8s.pod_log_tail_lines": "Lines of the container's own log to keep. Usually a duplicate of the Airflow log — but when a task is killed mid-flight, Airflow never receives the tail and the pod is the only copy. 0 turns it off.",

  // ---- kafka
  "kafka.bootstrap_servers": "Broker list, host:port[,host:port]. Takes effect on restart.",
  "kafka.partitions": "Partitions for topics vayurix creates. More partitions allow more parallel consumers; existing topics are not resized.",
  "kafka.replication": "Replication factor for those topics. Must not exceed the number of brokers.",
  "kafka.security_protocol": "How the client talks to the broker: plaintext | ssl | sasl_plaintext | sasl_ssl. A TLS/SASL broker silently closes a plaintext connection during the handshake rather than giving an error that names the mismatch, so this has to match the broker, not be discovered from a stack trace. Takes effect on restart.",
  "kafka.ssl_ca_location": "PEM CA bundle used to verify the broker's certificate (ssl/sasl_ssl). Needed whenever the broker's CA is not in the system trust store — the usual case for an internal cluster CA.",
  "kafka.ssl_certificate_location": "Client certificate (PEM) — only for mutual TLS, where the broker itself authenticates the client. Leave empty otherwise.",
  "kafka.ssl_key_location": "Private key (PEM) matching ssl_certificate_location. If the key has its own passphrase, set KAFKA_SSL_KEY_PASSWORD in .env — that's a credential, not a setting.",
  "kafka.sasl_mechanism": "SASL mechanism for sasl_plaintext/sasl_ssl: plain | scram-sha-256 | scram-sha-512. Empty means no SASL layer.",
  "kafka.sasl_username": "SASL username. The password is a credential — set KAFKA_SASL_PASSWORD in .env, not here.",

  // ---- spark_history
  "spark_history.base_url": "Spark History Server API root, e.g. http://host:18080/api/v1.",
  "spark_history.env": "How Spark application ids are shaped, so they can be recognised in logs. `other` matches any format.",
  "spark_history.fetch_retries": "The History Server lags a few seconds behind a finished app; this many re-polls before giving up on it.",
  "spark_history.fetch_retry_delay_sec": "Seconds between those polls.",

  // ---- auth
  "auth.session_ttl_hours": "Maximum life of a sign-in, however active the person is.",
  "auth.idle_timeout_min": "A session unused for this long is revoked the next time it is presented.",
  "auth.max_failed_logins": "Wrong passwords for one account before it locks.",
  "auth.lockout_min": "How long that lock lasts.",
  "auth.require_2fa_for": "Who must also enter a one-time code emailed to them: nobody, admins and managers, or everyone.",
  "auth.otp_fallback": "When the code cannot be emailed at all: deny the sign-in, or let the password stand alone (recorded in the audit log).",
  "auth.email_otp_expire_minutes": "How long an emailed code stays valid.",
  "auth.email_otp_max_attempts": "Wrong codes allowed before the whole sign-in attempt is thrown away.",
  "auth.email_otp_resend_sec": "Cooldown before another code can be requested.",
  "auth.cookie_secure": "Send the session cookie only over HTTPS. Turn off only on a plain-http dev host — browsers silently drop Secure cookies there.",
  "auth.api_key_is_admin": "Transitional: lets VAYURIX_API_KEY act as an admin. Off = the key may only ingest events and read telemetry.",
  "auth.login_max_failures": "Failed sign-ins allowed per source address per window, across all accounts — this is what stops one password being tried on many mailboxes.",
  "auth.login_window_sec": "Length of that window.",

  // ---- rca_policy
  "rca_policy.retry_notify_threshold": "Which retry number opens a case and pages someone. A failed run always opens one.",
  "rca_policy.max_evidence_chars": "Cap on log text sent to the model. 0 = no cap, which gets expensive on chatty tasks.",
  "rca_policy.sla_evaluate_interval_sec": "How often deadlines are evaluated. Whether the pass runs at all is the `sla` service.",
  "rca_policy.sla_catchup_days": "How far back each pass re-checks deadlines, so a stopped watcher catches up.",
  "rca_policy.sla_tuning_interval_days": "Minimum days between tuning recommendations for the same policy. Checked every tick; the LLM only runs this often.",
  "rca_policy.sla_tuning_min_samples": "Minimum recent samples before a tuning recommendation is written. Fewer would be noise, not signal.",
  "rca_policy.sla_tuning_sample_limit": "How many recent runs/results a tuning pass reads per policy, most-recent-first.",
  "rca_policy.sla_tuning_max_per_pass": "Cap on LLM calls per tuning pass, so a burst of newly-due policies can't delay the next deadline-evaluation tick.",

  // ---- email
  "email.host": "SMTP server for escalation notices and sign-in codes. Empty disables email entirely.",
  "email.port": "SMTP port. 587 = STARTTLS, which is what this client speaks.",
  "email.user": "Account used to authenticate. Empty = no auth. Its password is SMTP_PASSWORD in .env.",
  "email.from": "Sender address. Gmail requires this to be the authenticated account.",

  // ---- line
  "line.push_url": "LINE Messaging API push endpoint. Change only for a proxy or a regional endpoint. The channel token is LINE_CHANNEL_ACCESS_TOKEN in .env.",

  // ---- notification
  "notification.channel": "How on-call people are contacted: LINE or email.",
  "notification.incident_grouping": "Fold cases with the same error signature into one incident, so a repeating failure pages once.",
  "notification.incident_semantic_fallback": "Also group near-identical errors by meaning, using embeddings. Needs grouping on.",
  "notification.incident_window_min": "How far back that similarity search looks.",
  "notification.escalation_timeout_min": "How long one person has to respond before the next on the chain is paged.",
  "notification.escalation_check_interval_sec": "How often that deadline is checked. Whether the watcher runs at all is the `escalation` service.",
  "notification.public_base_url": "URL the action buttons in notifications point at. It must be reachable from a phone, so localhost will not do.",
  "notification.followup_first_delay_min": "Delay before the first reminder on a case nobody has closed.",
  "notification.followup_interval_hours": "Gap between later reminders.",
  "notification.followup_max_before_manager": "Reminders the owner may ignore before the domain's manager is told the case is stuck. Reminders continue either way.",
  "notification.manager_reminder_min": "How often managers are re-asked while a case still has no owner. There is no rung above them, so this repeat is the only pressure left.",
  "notification.orphan_grace_min": "How long a case with no notifications at all waits before the watcher rescues it — the safety net for a worker that died mid-send.",

  // ---- retention
  "retention.retention_months": "How long logs, dead letters and run history are kept before being dropped.",
  "retention.months_ahead": "How many future monthly log partitions to pre-create. Too few and inserts fail at a month boundary.",
  "retention.check_interval_hours": "How often the cleanup runs. Whether it runs at all is the `retention` service.",
};
