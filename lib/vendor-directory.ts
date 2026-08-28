import type { VendorDirectoryEntry } from "@/lib/types";

const MAX_DIRECTORY_ENTRIES_IN_PROMPT = 150;

export function mapRowToVendorDirectoryEntry(row: Record<string, unknown>): VendorDirectoryEntry {
  return {
    id: String(row.id ?? ""),
    vendorName: String(row.vendor_name ?? ""),
    productOrCategory: String(row.product_or_category ?? ""),
    mceGroup: String(row.mce_group ?? ""),
    businessUnit: String(row.business_unit ?? ""),
    lineCard: String(row.line_card ?? ""),
    branchName: String(row.branch_name ?? ""),
    contactName: String(row.contact_name ?? ""),
    contactEmail: String(row.contact_email ?? ""),
    contactPhone: String(row.contact_phone ?? ""),
    contactTitle: String(row.contact_title ?? ""),
    notes: String(row.notes ?? ""),
    sourceFile: String(row.source_file ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

export function formatVendorDirectory(entries: VendorDirectoryEntry[]) {
  if (!entries.length) {
    return "No vendor/branch/contact directory data has been uploaded yet.";
  }

  return entries
    .map((entry) =>
      [
        `Vendor: ${entry.vendorName || "Unknown"}`,
        entry.productOrCategory ? `Products/categories: ${entry.productOrCategory}` : "",
        `MCE group: ${entry.mceGroup || "Unknown"}`,
        entry.businessUnit ? `Business unit: ${entry.businessUnit}` : "",
        entry.lineCard ? `Line card: ${entry.lineCard}` : "",
        entry.branchName ? `Branch: ${entry.branchName}` : "",
        entry.contactName
          ? `Contact: ${entry.contactName}${entry.contactTitle ? ` (${entry.contactTitle})` : ""}`
          : "",
        entry.contactEmail ? `Contact email: ${entry.contactEmail}` : "",
        entry.contactPhone ? `Contact phone: ${entry.contactPhone}` : "",
        entry.notes ? `Notes: ${entry.notes}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

function tokenize(input: string) {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

export function shortlistVendorDirectory(
  entries: VendorDirectoryEntry[],
  query: string,
  limit: number = MAX_DIRECTORY_ENTRIES_IN_PROMPT
) {
  if (entries.length <= limit) return entries;

  const queryTokens = new Set(tokenize(query));
  if (!queryTokens.size) return entries.slice(0, limit);

  const scored = entries.map((entry) => {
    const haystack = tokenize(
      [entry.vendorName, entry.productOrCategory, entry.mceGroup, entry.businessUnit, entry.lineCard].join(" ")
    );
    const score = haystack.filter((token) => queryTokens.has(token)).length;
    return { entry, score };
  });

  scored.sort((left, right) => right.score - left.score);
  return scored.slice(0, limit).map((item) => item.entry);
}
