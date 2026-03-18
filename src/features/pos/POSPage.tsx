import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "@/lib/navigation";
import { Plus, Monitor, MapPin, Store, ArrowLeft, Lock, Unlock, WifiOff, RefreshCw, ShoppingCart, Package } from "lucide-react";
import { usePosStore } from "./stores/usePosStore";
import { useBarcodeScanner } from "./hooks/useBarcodeScanner";
import {
  useActiveSession,
  usePosRegisters,
  useCreatePosRegister,
  useOpenSession,
  useCloseSession,
} from "./hooks/usePosSession";
import {
  useLookupProductByBarcode,
  useCreateTransaction,
} from "./hooks/usePosTransaction";
import { ProductSearch } from "./components/ProductSearch";
import { CartDisplay } from "./components/CartDisplay";
import { CartTotals } from "./components/CartTotals";
import { PaymentModal } from "./components/PaymentModal";
import { CloseSessionModal } from "./components/CloseSessionModal";
import { TransactionHistoryDrawer } from "./components/TransactionHistoryDrawer";
import { CashMovementModal } from "./components/CashMovementModal";
import { SessionControls } from "./components/SessionControls";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { toast } from "@/stores/useToastStore";
import { printReceiptWindow, type ReceiptData } from "@/lib/receipt-printer";
import { queueTransaction, getPendingCount, type OfflineTransactionInput } from "@/lib/offline-queue";
import { syncOfflineTransactions, isOnline, startAutoSync } from "@/lib/offline-sync";
import { useCompanySettings } from "@/features/settings/hooks/useSettings";
import { lookupBarcodeOffline } from "@/lib/offline-barcode";
import { useQueryClient } from "@tanstack/react-query";

export function POSPage() {
  const { t } = useTranslation("pos");
  const router = useRouter();
  const currency = useSettingsStore((state) => state.currency);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCloseSessionModal, setShowCloseSessionModal] = useState(false);
  const [showTransactionHistory, setShowTransactionHistory] = useState(false);
  const [showCashMovement, setShowCashMovement] = useState(false);
  const [offlinePending, setOfflinePending] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [mobileTab, setMobileTab] = useState<"cart" | "products">("products");

  const {
    currentSession,
    currentRegister,
    setSession,
    items,
    addItem,
    clearCart,
    getFinalAmount,
  } = usePosStore();

  const queryClient = useQueryClient();
  const { data: companySettings } = useCompanySettings();

  // Queries
  const { data: registers } = usePosRegisters();
  const { data: activeSession } = useActiveSession(currentRegister?.id);

  // Mutations
  const lookupProduct = useLookupProductByBarcode();
  const createTransaction = useCreateTransaction();
  const createRegister = useCreatePosRegister();
  const openSession = useOpenSession();
  const closeSession = useCloseSession();

  // Inline register creation
  const [showCreateRegister, setShowCreateRegister] = useState(false);
  const [newRegisterName, setNewRegisterName] = useState("");
  const [newRegisterLocation, setNewRegisterLocation] = useState("");

  // Inline session opening
  const [openingFloat, setOpeningFloat] = useState("0");

  // Barcode scanner
  useBarcodeScanner({
    onScan: async (barcode) => {
      if (!currentSession) {
        toast.error(t("errors.noSession"));
        return;
      }

      try {
        let product;
        if (isOnline()) {
          product = await lookupProduct.mutateAsync(barcode);
        } else {
          // Offline fallback: search cached products
          product = lookupBarcodeOffline(queryClient, barcode);
        }
        if (product) {
          addItem(product);
          toast.success(t("productAdded", { name: product.designation }));
        } else {
          toast.error(t("errors.productNotFound", { barcode }));
        }
      } catch {
        // If online lookup fails, try offline cache as fallback
        const offlineProduct = lookupBarcodeOffline(queryClient, barcode);
        if (offlineProduct) {
          addItem(offlineProduct);
          toast.success(t("productAdded", { name: offlineProduct.designation }));
        } else {
          toast.error(t("errors.lookupFailed"));
        }
      }
    },
  });

  // Offline sync: start auto-sync and track pending count
  useEffect(() => {
    const stop = startAutoSync(30_000);
    const updateCount = () => getPendingCount().then(setOfflinePending).catch(() => {});
    updateCount();
    const interval = setInterval(updateCount, 10_000);
    return () => { stop(); clearInterval(interval); };
  }, []);

  // Sync session state
  useEffect(() => {
    if (activeSession && currentRegister) {
      setSession(activeSession, currentRegister);
    }
  }, [activeSession, currentRegister, setSession]);

  // Auto-select first register only on initial mount (not after user navigates back)
  const hasAutoSelected = useRef(false);
  useEffect(() => {
    if (!hasAutoSelected.current && registers?.length && !currentRegister) {
      const firstActive = registers.find((r) => r.is_active);
      if (firstActive) {
        setSession(null, firstActive);
        hasAutoSelected.current = true;
      }
    }
  }, [registers, currentRegister, setSession]);

  const handleOpenSession = async () => {
    if (!currentRegister) return;
    try {
      const amount = parseFloat(openingFloat) || 0;
      const session = await openSession.mutateAsync({
        register_id: currentRegister.id,
        opening_float: amount,
      });
      setSession(session, currentRegister);
      setOpeningFloat("0");
      toast.success(t("sessionOpened"));
    } catch {
      toast.error(t("errors.openSessionFailed"));
    }
  };

  const handleCloseSession = async (actualCash: number, notes?: string) => {
    if (!currentSession) return;
    try {
      await closeSession.mutateAsync({
        session_id: currentSession.id,
        actual_cash: actualCash,
        notes,
      });
      setSession(null, currentRegister);
      clearCart();
      setShowCloseSessionModal(false);
      toast.success(t("sessionClosed"));
    } catch {
      toast.error(t("errors.closeSessionFailed"));
    }
  };

  const buildReceiptData = (payments: Array<{ method: string; amount: number; cashGiven?: number }>): ReceiptData => {
    const store = usePosStore.getState();
    return {
      companyName: companySettings?.company_name || "Probook",
      ticketNumber: currentSession?.id.slice(0, 8) || "",
      date: new Date().toLocaleString(),
      items: items.map((item) => {
        const baseHt = item.quantity * item.unitPrice;
        const discountedHt = baseHt * (1 - item.discountPercent / 100);
        const vat = discountedHt * (item.taxRate / 100);
        return {
          designation: item.designation,
          quantity: item.quantity,
          unitPrice: item.unitPrice * (1 + item.taxRate / 100),
          total: discountedHt + vat,
          taxRate: item.taxRate,
          discountPercent: item.discountPercent,
        };
      }),
      subtotal: store.getSubtotal(),
      taxAmount: store.getTotalVat(),
      total: store.getTotal(),
      discountPercent: store.discountPercent,
      discountAmount: store.discountAmount,
      finalAmount: store.getFinalAmount(),
      payments: payments.map((p) => ({
        method: p.method as "CASH" | "CARD",
        amount: p.amount,
        cashGiven: p.cashGiven,
        changeGiven: p.cashGiven ? p.cashGiven - store.getFinalAmount() : undefined,
      })),
      currency: currency || "EUR",
      footerText: t("thankYou"),
    };
  };

  const handlePaymentComplete = async (payments: Array<{ method: string; amount: number; cashGiven?: number }>) => {
    if (!currentSession || !currentRegister || items.length === 0) return;

    const { discountPercent, discountAmount, clientId } = usePosStore.getState();

    const txInput: OfflineTransactionInput = {
      register_id: currentRegister.id,
      session_id: currentSession.id,
      client_id: clientId,
      lines: items.map((item) => ({
        product_id: item.productId,
        barcode: item.barcode,
        designation: item.designation,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        tax_rate: item.taxRate,
        discount_percent: item.discountPercent,
      })),
      payments: payments.map((p) => ({
        payment_method: p.method as "CASH" | "CARD",
        amount: p.amount,
        cash_given: p.cashGiven,
      })),
      discount_percent: discountPercent,
      discount_amount: discountAmount,
    };

    // Build receipt data before clearing the cart
    const receiptData = buildReceiptData(payments);

    try {
      if (isOnline()) {
        await createTransaction.mutateAsync(txInput);
        toast.success(t("transactionComplete"));
      } else {
        // Queue offline
        await queueTransaction(txInput);
        const count = await getPendingCount();
        setOfflinePending(count);
        toast.success(t("transactionQueued"));
      }

      // Print receipt
      printReceiptWindow(receiptData);

      clearCart();
      setShowPaymentModal(false);
    } catch {
      // If online request fails, try offline queue
      try {
        await queueTransaction(txInput);
        const count = await getPendingCount();
        setOfflinePending(count);
        printReceiptWindow(receiptData);
        clearCart();
        setShowPaymentModal(false);
        toast.success(t("transactionQueued"));
      } catch {
        toast.error(t("errors.transactionFailed"));
      }
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const result = await syncOfflineTransactions();
      const count = await getPendingCount();
      setOfflinePending(count);
      toast.success(t("syncComplete", { synced: result.synced, failed: result.failed }));
    } catch {
      toast.error(t("errors.transactionFailed"));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateRegister = async () => {
    if (!newRegisterName.trim()) return;
    try {
      const register = await createRegister.mutateAsync({
        name: newRegisterName.trim(),
        location: newRegisterLocation.trim() || undefined,
      });
      setSession(null, register);
      setShowCreateRegister(false);
      setNewRegisterName("");
      setNewRegisterLocation("");
      toast.success(t("registerCreated"));
    } catch {
      toast.error(t("errors.createRegisterFailed"));
    }
  };

  // ─── Register selection screen ───
  if (!currentRegister) {
    const activeRegisters = registers?.filter((r) => r.is_active) ?? [];

    return (
      <div className="h-screen flex flex-col bg-(--color-bg-primary)">
        {/* Top bar */}
        <div className="h-14 border-b border-(--color-border-primary) flex items-center px-4 shrink-0">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("backToOffice")}
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-900/20 text-primary-600 mb-4">
                <Store className="h-8 w-8" />
              </div>
              <h1 className="text-2xl font-bold">
                {activeRegisters.length > 0 ? t("selectRegister") : t("noRegisters")}
              </h1>
            </div>

            <div className="space-y-2">
              {activeRegisters.map((register) => (
                <button
                  key={register.id}
                  onClick={() => setSession(null, register)}
                  className="w-full flex items-center gap-4 p-4 bg-(--color-bg-secondary) hover:bg-(--color-bg-tertiary) border border-(--color-border-primary) rounded-xl transition-colors text-left"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 shrink-0">
                    <Monitor className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{register.name}</p>
                    {register.location && (
                      <p className="text-sm text-(--color-text-secondary) flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {register.location}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {showCreateRegister ? (
              <div className="mt-4 p-5 bg-(--color-bg-secondary) rounded-xl border border-(--color-border-primary) space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    {t("registerName")}
                  </label>
                  <input
                    type="text"
                    value={newRegisterName}
                    onChange={(e) => setNewRegisterName(e.target.value)}
                    placeholder={t("registerNamePlaceholder")}
                    className="w-full px-3 py-2.5 border border-(--color-border-input) rounded-lg bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleCreateRegister()}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    {t("registerLocation")}
                  </label>
                  <input
                    type="text"
                    value={newRegisterLocation}
                    onChange={(e) => setNewRegisterLocation(e.target.value)}
                    placeholder={t("registerLocationPlaceholder")}
                    className="w-full px-3 py-2.5 border border-(--color-border-input) rounded-lg bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
                    onKeyDown={(e) => e.key === "Enter" && handleCreateRegister()}
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowCreateRegister(false)}
                    className="flex-1 px-4 py-2.5 border border-(--color-border-primary) rounded-lg hover:bg-(--color-bg-secondary) font-medium transition-colors"
                  >
                    {t("cancel")}
                  </button>
                  <span>
                    <button
                      onClick={handleCreateRegister}
                      disabled={!newRegisterName.trim() || createRegister.isPending}
                      className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium disabled:opacity-50 transition-colors w-full"
                    >
                      {createRegister.isPending ? t("loading") : t("createRegister")}
                    </button>
                  </span>
                </div>
              </div>
            ) : (
              <span>
                <button
                  onClick={() => setShowCreateRegister(true)}
                  className="w-full mt-3 px-4 py-3 border-2 border-dashed border-(--color-border-secondary) rounded-xl hover:border-primary-600 hover:text-primary-600 text-(--color-text-secondary) flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="h-4 w-4" />
                  {t("createRegister")}
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Session closed screen (inline opening float) ───
  if (!currentSession) {
    return (
      <div className="h-screen flex flex-col bg-(--color-bg-primary)">
        {/* Top bar */}
        <div className="h-14 border-b border-(--color-border-primary) flex items-center justify-between px-4 shrink-0">
          <button
            onClick={() => {
              hasAutoSelected.current = true; // Prevent auto-reselect
              setSession(null, null);
            }}
            className="flex items-center gap-2 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("selectRegister")}
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
          >
            {t("backToOffice")}
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-sm text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 mb-4">
              <Lock className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold mb-1">{currentRegister.name}</h1>
            <p className="text-(--color-text-secondary) mb-8">{t("sessionClosed")}</p>

            {/* Inline opening float form */}
            <div className="bg-(--color-bg-secondary) rounded-xl border border-(--color-border-primary) p-5 text-left space-y-4">
              <p className="text-sm text-(--color-text-secondary)">
                {t("openingFloatDescription")}
              </p>
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  {t("openingFloat")} ({currency})
                </label>
                <input
                  type="number"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  className="w-full px-4 py-3 border border-(--color-border-input) rounded-lg text-2xl text-center font-bold bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleOpenSession()}
                />
              </div>
              <span>
                <button
                  onClick={handleOpenSession}
                  disabled={openSession.isPending}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-semibold text-lg disabled:opacity-50 transition-colors"
                >
                  <Unlock className="h-5 w-5" />
                  {openSession.isPending ? t("loading") : t("openSession")}
                </button>
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Active session: main POS layout ───
  return (
    <div className="h-screen flex flex-col bg-(--color-bg-secondary)">
      {/* Header */}
      <header className="h-14 bg-primary-600 text-white flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <span className="font-bold truncate">{currentRegister.name}</span>
          <span className="hidden sm:inline text-sm opacity-75 shrink-0">
            {t("ticket")}: {currentSession.id.slice(0, 8)}
          </span>
          {/* Offline indicator */}
          {offlinePending > 0 && (
            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-2 py-1 bg-orange-500/20 rounded text-xs font-medium hover:bg-orange-500/30 transition-colors"
              title={t("syncNow")}
            >
              {isSyncing ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <WifiOff className="h-3.5 w-3.5" />
              )}
              {t("offlinePending", { count: offlinePending })}
            </button>
          )}
        </div>
        <SessionControls
          onCloseSession={() => setShowCloseSessionModal(true)}
          onTransactionHistory={() => setShowTransactionHistory(true)}
          onCashMovement={() => setShowCashMovement(true)}
        />
      </header>

      {/* Mobile tab switcher */}
      <div className="lg:hidden flex border-b border-(--color-border-primary) bg-(--color-bg-primary) shrink-0">
        <button
          onClick={() => setMobileTab("products")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            mobileTab === "products"
              ? "text-primary-600 border-b-2 border-primary-600"
              : "text-(--color-text-secondary) hover:text-(--color-text-primary)"
          }`}
        >
          <Package className="h-4 w-4" />
          {t("products")}
        </button>
        <button
          onClick={() => setMobileTab("cart")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            mobileTab === "cart"
              ? "text-primary-600 border-b-2 border-primary-600"
              : "text-(--color-text-secondary) hover:text-(--color-text-primary)"
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          {t("cart")} {items.length > 0 && `(${items.length})`}
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Cart section (60% on desktop, full on mobile when tab active) */}
        <div className={`lg:w-3/5 flex flex-col bg-(--color-bg-primary) lg:border-r border-(--color-border-primary) ${
          mobileTab === "cart" ? "flex" : "hidden lg:flex"
        }`}>
          <CartDisplay />
          <CartTotals />
          {/* Payment bar */}
          <div className="p-4 border-t border-(--color-border-primary) shrink-0">
            <span>
              <button
                onClick={() => setShowPaymentModal(true)}
                disabled={items.length === 0}
                className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t("pay")} - {getFinalAmount().toFixed(2)}
              </button>
            </span>
          </div>
        </div>

        {/* Product section (40% on desktop, full on mobile when tab active) */}
        <div className={`lg:w-2/5 flex flex-col ${
          mobileTab === "products" ? "flex" : "hidden lg:flex"
        }`}>
          <ProductSearch onProductSelect={(product) => {
            addItem(product);
            // On mobile, switch to cart after adding a product
            if (window.innerWidth < 1024) setMobileTab("cart");
          }} />
        </div>
      </div>

      {/* Modals */}
      <PaymentModal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onConfirm={handlePaymentComplete}
        totalAmount={getFinalAmount()}
        isLoading={createTransaction.isPending}
      />

      <CloseSessionModal
        open={showCloseSessionModal}
        onClose={() => setShowCloseSessionModal(false)}
        onConfirm={handleCloseSession}
        sessionId={currentSession.id}
        isLoading={closeSession.isPending}
      />

      <TransactionHistoryDrawer
        open={showTransactionHistory}
        onClose={() => setShowTransactionHistory(false)}
        sessionId={currentSession.id}
      />

      <CashMovementModal
        open={showCashMovement}
        onClose={() => setShowCashMovement(false)}
        sessionId={currentSession.id}
      />
    </div>
  );
}
