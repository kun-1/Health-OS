"use client";

import { useRef, useState } from "react";

type Props = {
  onUpload: (formData: FormData) => Promise<void> | void;
  maxFiles: number;
  maxBytesPerFile: number;
  hint: string;
  compact?: boolean;
};

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function ReceiptUploader({ onUpload, maxFiles, maxBytesPerFile, hint, compact = false }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (incoming.length === 0) return;
    setFiles((current) => {
      const next = [...current];
      const existing = new Set(next.map(fileKey));
      for (const file of incoming) {
        if (next.length >= maxFiles) break;
        if (file.size > maxBytesPerFile) {
          setError(`${file.name} 超过 ${formatBytes(maxBytesPerFile)} 限制`);
          continue;
        }
        const key = fileKey(file);
        if (!existing.has(key)) {
          next.push(file);
          existing.add(key);
        }
      }
      return next;
    });
  }

  async function submit() {
    if (files.length === 0) {
      setError("请先选择票据图片");
      return;
    }
    setError("");
    setBusy(true);
    const formData = new FormData();
    for (const f of files) formData.append("receipts", f);
    try {
      await onUpload(formData);
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  const overLimit = files.length >= maxFiles;

  return (
    <div className={compact ? "exp-uploader exp-uploader--compact" : "exp-uploader"}>
      <div
        className="exp-uploader__zone"
        onClick={() => fileRef.current?.click()}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
        }}
        style={dragOver ? { background: "var(--exp-accent-soft)", borderColor: "var(--exp-accent)" } : undefined}
      >
        <div className="exp-uploader__icon">
          <svg fill="none" height="22" viewBox="0 0 24 24" width="22" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M3 16.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1.5M7 10l5-5 5 5M12 5v12"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </div>
        <div className="exp-uploader__title">
          {overLimit ? `已选满 ${maxFiles} 张` : compact ? "新增票据" : "拖入票据，或点击选择"}
        </div>
        {compact ? null : <div className="exp-uploader__hint">{hint}</div>}
        <div className="exp-uploader__actions" onClick={(e) => e.stopPropagation()}>
          {/* Wave 3 multi-image: both buttons are now always shown, even in
              compact mode. The file picker (📎) on mobile triggers the
              native action sheet (Take Photo / Photo Library / Choose File),
              which is the only way to multi-select from the photo library —
              the camera button (📷) below has `capture="environment"` which
              forces camera-only mode and bypasses the library entirely. */}
          <button
            className={compact ? "exp-pill exp-pill--ghost" : "exp-btn exp-btn--secondary exp-btn--sm"}
            disabled={overLimit}
            onClick={() => fileRef.current?.click()}
            type="button"
          >
            <span aria-hidden>📎</span>
            {compact ? "选图" : "浏览文件"}
          </button>
          <button
            className={compact ? "exp-pill exp-pill--ghost" : "exp-btn exp-btn--secondary exp-btn--sm"}
            disabled={overLimit}
            onClick={() => cameraRef.current?.click()}
            type="button"
          >
            <span aria-hidden>📷</span>
            {compact ? "拍照" : "拍照识别"}
          </button>
        </div>
      </div>

      <input
        accept="image/jpeg,image/png,image/webp"
        hidden
        multiple
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
        ref={fileRef}
        type="file"
      />
      <input
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
        ref={cameraRef}
        type="file"
      />

      {files.length > 0 ? (
        <div className="exp-uploader__files">
          {files.map((f) => (
            <div className="exp-uploader__file" key={fileKey(f)}>
              <span className="exp-uploader__file-name">
                <span aria-hidden>📄</span> {f.name}
              </span>
              <span className="exp-uploader__file-meta">
                {formatBytes(f.size)}
                <button
                  className="exp-btn exp-btn--ghost exp-btn--sm"
                  onClick={() => setFiles((c) => c.filter((x) => fileKey(x) !== fileKey(f)))}
                  type="button"
                >
                  移除
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {compact && files.length === 0 && !error ? null : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 12, flexWrap: "wrap" }}>
          <div className="exp-uploader__note" style={{ marginTop: 0 }}>
            {error ? <span style={{ color: "var(--exp-danger)" }}>{error}</span> : compact ? hint : `一次最多 ${maxFiles} 张，避免视觉模型请求排队过久`}
          </div>
          <button
            className="exp-btn exp-btn--primary"
            disabled={busy || files.length === 0}
            onClick={submit}
            type="button"
          >
            <span aria-hidden>✨</span>
            {busy ? "识别中..." : "识别票据"}
          </button>
        </div>
      )}
    </div>
  );
}
