// src/main/ipc/copylog.ts
// Intentionally inactive. BackupLogs is currently a parked/unmounted view, so no
// renderer-facing copy-log IPC channel is registered. If the feature is revived,
// add a dedicated handler whose inputs are bounded and whose filesystem roots are
// resolved exclusively from trusted main-process configuration.

export {};
