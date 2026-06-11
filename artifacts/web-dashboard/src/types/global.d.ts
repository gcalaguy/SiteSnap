/**
 * Type augmentations for browser APIs and third-party libraries that lack
 * complete TypeScript definitions out-of-the-box.
 */

// ── File System Access API ────────────────────────────────────────────────
// MDN: https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle
interface FileSystemHandle {
  queryPermission(
    descriptor?: { mode?: "read" | "readwrite" },
  ): Promise<PermissionState>;
  requestPermission(
    descriptor?: { mode?: "read" | "readwrite" },
  ): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker(options?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: string | FileSystemHandle;
  }): Promise<FileSystemDirectoryHandle>;
}

// ── Contact Picker API ────────────────────────────────────────────────────
// MDN: https://developer.mozilla.org/en-US/docs/Web/API/Contact_Picker_API
interface ContactAddress {
  city?: string;
  country?: string;
  dependentLocality?: string;
  organization?: string;
  phone?: string;
  postalCode?: string;
  recipient?: string;
  region?: string;
  sortingCode?: string;
  addressLine?: string[];
}

interface ContactInfo {
  address?: ContactAddress[];
  email?: string[];
  icon?: Blob[];
  name?: string[];
  tel?: string[];
}

type ContactProperty = "address" | "email" | "icon" | "name" | "tel";

interface ContactsManager {
  getProperties(): Promise<ContactProperty[]>;
  select(
    properties: ContactProperty[],
    options?: { multiple?: boolean },
  ): Promise<ContactInfo[]>;
}

interface Navigator {
  contacts?: ContactsManager;
}

// ── jsPDF autoTable ───────────────────────────────────────────────────────
// jspdf-autotable adds `lastAutoTable` to the jsPDF instance at runtime but
// does not ship a module augmentation. Declare it here so callers don't need
// to cast `doc` to `any`.
declare module "jspdf" {
  interface jsPDF {
    lastAutoTable: {
      finalY: number;
      pageCount: number;
      [key: string]: unknown;
    };
  }
}
