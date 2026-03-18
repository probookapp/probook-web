// ─── Offline POS Transaction Queue (IndexedDB) ───

const DB_NAME = "probook-offline";
const DB_VERSION = 1;
const STORE_NAME = "pending-transactions";

export interface OfflineTransactionInput {
  register_id: string;
  session_id: string;
  client_id?: string | null;
  lines: Array<{
    product_id: string | null;
    barcode: string | null;
    designation: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    discount_percent: number;
  }>;
  payments: Array<{
    payment_method: "CASH" | "CARD";
    amount: number;
    cash_given?: number;
  }>;
  discount_percent: number;
  discount_amount: number;
}

export interface OfflineTransaction {
  id?: number;
  data: OfflineTransactionInput;
  createdAt: string;
  status: "pending" | "syncing" | "failed";
  error?: string;
  retryCount: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueTransaction(
  data: OfflineTransactionInput,
): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const entry: OfflineTransaction = {
      data,
      createdAt: new Date().toISOString(),
      status: "pending",
      retryCount: 0,
    };
    const request = store.add(entry);
    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingTransactions(): Promise<OfflineTransaction[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result as OfflineTransaction[];
      resolve(all.filter((t) => t.status === "pending" || t.status === "failed"));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingCount(): Promise<number> {
  const pending = await getPendingTransactions();
  return pending.length;
}

export async function markSynced(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function markFailed(id: number, error: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const entry = getRequest.result as OfflineTransaction;
      if (entry) {
        entry.status = "failed";
        entry.error = error;
        entry.retryCount += 1;
        const putRequest = store.put(entry);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function clearAll(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
