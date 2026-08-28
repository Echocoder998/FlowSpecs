"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { extractSourceFileText } from "@/lib/file-extraction";
import type { VendorDirectoryDraftEntry, VendorDirectoryEntry } from "@/lib/types";

const DRAFT_FIELDS: { key: keyof VendorDirectoryDraftEntry; label: string }[] = [
  { key: "vendorName", label: "Vendor" },
  { key: "productOrCategory", label: "Products / category" },
  { key: "mceGroup", label: "MCE group" },
  { key: "businessUnit", label: "Business unit" },
  { key: "lineCard", label: "Line card" },
  { key: "branchName", label: "Branch" },
  { key: "contactName", label: "Contact" },
  { key: "contactTitle", label: "Title" },
  { key: "contactEmail", label: "Email" },
  { key: "contactPhone", label: "Phone" },
  { key: "notes", label: "Notes" }
];

function emptyDraftEntry(sourceFile: string): VendorDirectoryDraftEntry {
  return {
    vendorName: "",
    productOrCategory: "",
    mceGroup: "",
    businessUnit: "",
    lineCard: "",
    branchName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    contactTitle: "",
    notes: "",
    sourceFile
  };
}

export default function AdminPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [entries, setEntries] = useState<VendorDirectoryEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState("");
  const [filter, setFilter] = useState("");

  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [pendingFileName, setPendingFileName] = useState("");
  const [pendingFileType, setPendingFileType] = useState("");
  const [draftEntries, setDraftEntries] = useState<VendorDirectoryDraftEntry[]>([]);
  const [saving, setSaving] = useState(false);

  async function loadEntries() {
    setEntriesLoading(true);
    setEntriesError("");
    try {
      const response = await fetch("/api/admin/vendor-directory");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Failed to load directory.");
      setEntries(payload.entries || []);
    } catch (err) {
      setEntriesError(err instanceof Error ? err.message : "Failed to load directory.");
    } finally {
      setEntriesLoading(false);
    }
  }

  useEffect(() => {
    loadEntries();
  }, []);

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  async function handleFile(file: File) {
    setUploadError("");
    setUploadStatus("");
    setDraftEntries([]);
    setUploading(true);
    setPendingFileName(file.name);
    setPendingFileType(file.type || file.name.split(".").pop() || "");

    try {
      setUploadStatus("Reading file...");
      const extractedText = await extractSourceFileText(file, (label) => setUploadStatus(label));

      setUploadStatus("Extracting directory rows...");
      const response = await fetch("/api/admin/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type, extractedText })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Extraction failed.");

      const parsed: VendorDirectoryDraftEntry[] = (payload.result?.entries || []).map(
        (entry: Partial<VendorDirectoryDraftEntry>) => ({
          ...emptyDraftEntry(file.name),
          ...entry,
          sourceFile: file.name
        })
      );

      if (!parsed.length) {
        setUploadStatus("No directory rows were found in this file.");
      } else {
        setUploadStatus(`Parsed ${parsed.length} row${parsed.length === 1 ? "" : "s"} for review.`);
      }
      setDraftEntries(parsed);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to process file.");
      setUploadStatus("");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function updateDraftField(index: number, field: keyof VendorDirectoryDraftEntry, value: string) {
    setDraftEntries((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, [field]: value } : entry))
    );
  }

  function removeDraftRow(index: number) {
    setDraftEntries((current) => current.filter((_, entryIndex) => entryIndex !== index));
  }

  async function handleSaveDraft() {
    setSaving(true);
    setUploadError("");
    try {
      const response = await fetch("/api/admin/vendor-directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: draftEntries,
          fileName: pendingFileName,
          fileType: pendingFileType
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Failed to save entries.");

      setDraftEntries([]);
      setUploadStatus(`Saved ${payload.entries?.length || 0} entries to the directory.`);
      await loadEntries();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to save entries.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEntry(id: string) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
    const response = await fetch(`/api/admin/vendor-directory?id=${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      await loadEntries();
    }
  }

  const filteredEntries = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) =>
      [
        entry.vendorName,
        entry.productOrCategory,
        entry.mceGroup,
        entry.businessUnit,
        entry.lineCard,
        entry.branchName,
        entry.contactName
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [entries, filter]);

  return (
    <div className="admin-shell">
      <div className="admin-header">
        <h1>MCE Vendor / Branch / Contact Directory</h1>
        <button className="admin-logout" onClick={handleLogout}>
          Log out
        </button>
      </div>

      <div className="admin-panel">
        <h2>Upload a directory file</h2>
        <div
          className="admin-dropzone"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
        >
          {uploading ? uploadStatus || "Processing..." : "Click or drop a PDF, XLSX, CSV, or TXT file"}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.xlsx,.csv,.txt,application/pdf,text/csv,text/plain"
          style={{ display: "none" }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {uploadError && <p className="admin-error">{uploadError}</p>}
        {!uploading && uploadStatus && !uploadError && <p className="admin-status">{uploadStatus}</p>}
      </div>

      {draftEntries.length > 0 && (
        <div className="admin-panel">
          <h2>Review parsed rows before saving</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  {DRAFT_FIELDS.map((field) => (
                    <th key={field.key}>{field.label}</th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {draftEntries.map((entry, index) => (
                  <tr key={index}>
                    {DRAFT_FIELDS.map((field) => (
                      <td key={field.key}>
                        <input
                          value={entry[field.key]}
                          onChange={(event) => updateDraftField(index, field.key, event.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      <button className="admin-row-remove" onClick={() => removeDraftRow(index)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-actions">
            <button className="admin-primary-button" onClick={handleSaveDraft} disabled={saving || !draftEntries.length}>
              {saving ? "Saving..." : `Save ${draftEntries.length} entries`}
            </button>
          </div>
        </div>
      )}

      <div className="admin-panel">
        <h2>Current directory ({entries.length})</h2>
        <input
          className="admin-filter"
          placeholder="Filter by vendor, branch, contact..."
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        {entriesError && <p className="admin-error">{entriesError}</p>}
        {entriesLoading ? (
          <p className="admin-empty">Loading...</p>
        ) : filteredEntries.length === 0 ? (
          <p className="admin-empty">No directory entries yet. Upload a file above to add some.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Products / category</th>
                  <th>MCE group</th>
                  <th>Business unit</th>
                  <th>Line card</th>
                  <th>Branch</th>
                  <th>Contact</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.vendorName}</td>
                    <td>{entry.productOrCategory}</td>
                    <td>{entry.mceGroup}</td>
                    <td>{entry.businessUnit}</td>
                    <td>{entry.lineCard}</td>
                    <td>{entry.branchName}</td>
                    <td>
                      {entry.contactName}
                      {entry.contactTitle ? ` (${entry.contactTitle})` : ""}
                    </td>
                    <td>{entry.contactEmail}</td>
                    <td>{entry.contactPhone}</td>
                    <td>
                      <button className="admin-row-delete" onClick={() => handleDeleteEntry(entry.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
