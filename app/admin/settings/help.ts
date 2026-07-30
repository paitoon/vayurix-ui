// What each setting means, in one line, in the words an operator would use.
//
// Kept beside the screen rather than shipped from the API: this is interface copy, and it changes
// for reasons ("nobody understood that sentence") that have nothing to do with the backend. A key
// with no entry simply shows no help, so adding a setting never breaks this file.

export const HELP: Record<string, string> = {
  // ---- app
  "app.name": "Label for this deployment, shown in the console header. Give prod and staging different names.",
  "app.timezone": "IANA zone used for log timestamps and the `_local` fields in API responses. Empty = UTC. Stored data stays UTC.",

  // ---- services
  "services.host": "Address the API binds to. 0.0.0.0 = every interface; 127.0.0.1 = only this machine. Takes effect on restart.",
  "services.port": "Port the API listens on. Takes effect on restart.",

  // ---- worker
  "worker.heartbeat_interval_sec": "How often each worker records that it is alive. The supervisor checks at the same cadence.",
  "worker.stale_after_sec": "A worker silent for longer than this is treated as hung and restarted. Keep it several heartbeats long to avoid false alarms.",
  "worker.shutdown_grace_sec": "Seconds a worker gets to leave its Kafka group cleanly after SIGTERM before being killed outright.",

  // ---- agent
  "agent.llm": "Which model backend performs root-cause analysis. azure_openai needs a key in .env; ollama runs locally.",

  // ---- embedding
  "embedding.provider": "Which backend produces embeddings for search and duplicate detection. Changing this after data exists mixes vector spaces and breaks similarity — re-embed if you switch.",
  "embedding.max_chars": "Characters of text sent per embedding request. Longer inputs cost more and get truncated by the model anyway.",

  // ---- azure_openai
  "azure_openai.chat_deployment": "Name of the Azure deployment (not the model name) used for analysis.",
  "azure_openai.chat_api_version": "Azure REST API version. Change only when Azure retires the one in use.",
  "azure_openai.chat_endpoint": "Base URL of the Azure resource serving the chat deployment.",
  "azure_openai.text_embedding_endpoint": "Base URL for embeddings. Usually the same resource as chat.",
  "azure_openai.text_embedding_model": "Embedding deployment/model name, e.g. text-embedding-3-small.",
  "azure_openai.text_embedding_dimensions": "Vector width requested from Azure. Must match the `vector(n)` columns in the database.",

  // ---- ollama
  "ollama.ollama_base_url": "Where the Ollama server is. From inside a container this is the host IP, not localhost.",
  "ollama.chat_model": "Model tag used for analysis, e.g. gpt-oss:20b. It must already be pulled on that server.",
  "ollama.text_embedding_model": "Model tag used for embeddings, e.g. nomic-embed-text. Its dimensionality is fixed by the model.",
  "ollama.embed_max_retries": "Extra attempts after a transient embedding failure before giving up on that batch.",
  "ollama.embed_backoff_base_sec": "Base delay for those retries; it doubles each attempt.",
  "ollama.circuit_fail_threshold": "Consecutive failures that trip the breaker, after which requests fail fast instead of piling up.",
  "ollama.circuit_reset_sec": "How long the breaker stays open before one request is allowed through to test recovery.",
  "ollama.embed_batch_size": "Texts per embedding request. Larger batches mean fewer round trips and more memory on the model server.",

  // ---- airflow
  "airflow.base_url": "Airflow REST API root, including the version, e.g. http://host:8080/api/v2.",
  "airflow.username": "Airflow user used to read logs and task state. Its password is AIRFLOW_PASSWORD in .env.",
  "airflow.log_max_wait_sec": "How long to keep waiting for a task log that Airflow has not finished writing.",
  "airflow.log_poll_sec": "Gap between those attempts.",
  "airflow.lineage_resync_hours": "How often asset lineage is re-read into the graph. 0 = at startup and on demand only.",

  // ---- kafka
  "kafka.bootstrap_servers": "Broker list, host:port[,host:port]. Takes effect on restart.",
  "kafka.partitions": "Partitions for topics vayurix creates. More partitions allow more parallel consumers; existing topics are not resized.",
  "kafka.replication": "Replication factor for those topics. Must not exceed the number of brokers.",

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

  // ---- retention
  "retention.retention_months": "How long logs, dead letters and run history are kept before being dropped.",
  "retention.months_ahead": "How many future monthly log partitions to pre-create. Too few and inserts fail at a month boundary.",
  "retention.check_interval_hours": "How often the cleanup runs. Whether it runs at all is the `retention` service.",
};
