import { useState, useReducer, useContext, createContext, useEffect, useLayoutEffect, useRef } from "react";
import { formatTabTitle } from "./utils/tabTitle.js";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import {
  ShoppingCart, Search, User, ChevronDown, LogOut, Package,
  Shield, Eye, EyeOff, Mail, Lock, UserPlus, LogIn, Fingerprint,
  ArrowRight, Store, Settings, X, Menu, Filter, LayoutGrid, List,
  ChevronUp, CheckCircle, AlertTriangle, XCircle, Info, Trash2,
  MapPin, Home, Hash, Building, Map, CreditCard, FileText, Copy, Zap,
  Phone, BarChart3, Users, Plus, Pencil, ToggleLeft, ToggleRight, RefreshCw, Warehouse, ImagePlus, Upload,
  MessageCircle, MessageSquare,
} from "lucide-react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API LAYER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const API = "/api";

async function api(endpoint, options = {}, dispatch = null) {
  const { bearerToken, ...rest } = options;
  const token = bearerToken !== undefined ? bearerToken : sessionStorage.getItem("novamart_token");
  // Detecta FormData de forma mais robusta para uploads.
  // Alguns ambientes/bundlers podem quebrar o `instanceof FormData`.
  const isFormData =
    !!rest.body &&
    (typeof FormData !== "undefined"
      ? rest.body instanceof FormData
      : rest.body?.constructor?.name === "FormData") ||
    !!rest.body?.append && typeof rest.body.append === "function";
  const config = {
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...rest,
  };
  if (rest.body != null) {
    config.body = isFormData ? rest.body : (typeof rest.body === "object" ? JSON.stringify(rest.body) : rest.body);
  }
  const res = await fetch(`${API}${endpoint}`, config);
  let data;
  try {
    data = await res.json();
  } catch {
    data = { message: "Resposta inválida do servidor" };
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      sessionStorage.removeItem("novamart_token");
      if (dispatch) dispatch({ type: "LOGOUT" });
    }
    throw { status: res.status, message: data.message || "Erro desconhecido", data };
  }
  return data;
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CATEGORIES = ["Eletrônicos", "Roupas", "Casa", "Esportes"];

function getDefaultEmoji(category) {
  const map = { Eletrônicos: "🔌", Roupas: "👕", Casa: "🏠", Esportes: "⚽" };
  return map[category] || "📦";
}

const BR_STATES = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REDUCER & CONTEXT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const defaultCheckoutData = {
  address: { zip: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" },
  paymentMethod: null,
  cardData: { number: "", name: "", expiry: "", cvv: "" },
  termsAccepted: false,
};

const initialState = {
  users: [],
  products: [],
  orders: [],
  cart: [],
  currentUser: null,
  currentPage: "auth",
  toasts: [],
  searchQuery: "",
  filters: { categories: [], priceMin: null, priceMax: null, sortBy: "default" },
  viewMode: "grid",
  cartDrawerOpen: false,
  selectedProduct: null,
  checkoutStep: 1,
  checkoutData: defaultCheckoutData,
  orderSuccess: null,
  ordersFilter: "all",
  loading: false,
  apiError: null,
  adminPage: "overview",
  adminProducts: [],
  adminUsers: [],
  inventory: null,
  chatConversations: [],
  chatMessages: [],
  chatOpen: false,
  activeChatId: null,
  chatUnreadCount: 0,
  chatLoading: false,
  newChatSubject: "",
  newChatMessage: "",
  profilePage: "view",
  smsStep: "input",
  smsPendingPhone: "",
  smsCode: ["", "", "", "", "", ""],
  smsError: null,
  smsCountdown: 0,
  smsMockCode: null,
  profileLoading: false,
  profileData: null,
  pixConfig: null,
  pixQrData: null,
  pixLoading: false,
  adminPixForm: {
    pixKey: "",
    pixKeyType: "cpf",
    pixBeneficiaryName: "",
    pixCity: "",
  },
  adminPixSaving: false,
  adminPixLoaded: false,
  storeIcon: "Store",
  storeIconLoaded: false,
  siteConfig: null,
  siteConfigLoaded: false,
};

function appReducer(state, action) {
  switch (action.type) {
    case "LOGIN":
      return { ...state, currentUser: action.payload, currentPage: "home", cart: [], apiError: null };
    case "LOGOUT":
      return { ...state, currentUser: null, currentPage: "auth", cart: [], searchQuery: "", orderSuccess: null, checkoutStep: 1, checkoutData: defaultCheckoutData, apiError: null };
    case "NAVIGATE":
      return { ...state, currentPage: action.payload };
    case "SET_SEARCH":
      return { ...state, searchQuery: action.payload };
    case "ADD_TO_CART": {
      const { productId, quantity = 1 } = action.payload;
      const existing = state.cart.find(i => i.productId === productId);
      const product = state.products.find(p => p.id === productId);
      if (!product || product.stock === 0) return state;
      if (existing) {
        const newQty = Math.min(existing.quantity + quantity, product.stock);
        return { ...state, cart: state.cart.map(i => i.productId === productId ? { ...i, quantity: newQty } : i) };
      }
      return { ...state, cart: [...state.cart, { productId, quantity: Math.min(quantity, product.stock) }] };
    }
    case "UPDATE_CART_QTY": {
      const { productId, quantity } = action.payload;
      if (quantity <= 0) return { ...state, cart: state.cart.filter(i => i.productId !== productId) };
      const prod = state.products.find(p => p.id === productId);
      const clampedQty = Math.min(quantity, prod?.stock || 0);
      return { ...state, cart: state.cart.map(i => i.productId === productId ? { ...i, quantity: clampedQty } : i) };
    }
    case "REMOVE_FROM_CART":
      return { ...state, cart: state.cart.filter(i => i.productId !== action.payload) };
    case "CLEAR_CART":
      return { ...state, cart: [] };
    case "CREATE_ORDER": {
      const order = action.payload;
      const updatedProducts = state.products.map(p => {
        const item = order.items.find(i => i.productId === p.id);
        return item ? { ...p, stock: Math.max(0, p.stock - item.quantity) } : p;
      });
      return { ...state, orders: [...state.orders, order], products: updatedProducts, cart: [] };
    }
    case "UPDATE_ORDER_STATUS":
      return { ...state, orders: state.orders.map(o => o.id === action.payload.orderId ? { ...o, status: action.payload.status } : o) };
    case "ADD_PRODUCT":
      return { ...state, products: [...state.products, { ...action.payload, id: `p${Date.now()}` }] };
    case "UPDATE_PRODUCT":
      return { ...state, products: state.products.map(p => p.id === action.payload.id ? { ...p, ...action.payload } : p) };
    case "DELETE_PRODUCT":
      return { ...state, products: state.products.filter(p => p.id !== action.payload) };
    case "UPDATE_USER_ROLE":
      return { ...state, users: state.users.map(u => u.id === action.payload.userId ? { ...u, role: action.payload.role } : u) };
    case "ADD_TOAST":
      return { ...state, toasts: [...state.toasts, { id: Date.now(), ...action.payload }] };
    case "REMOVE_TOAST":
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
    case "SET_FILTERS":
      return { ...state, filters: { ...state.filters, ...action.payload } };
    case "RESET_FILTERS":
      return { ...state, filters: { categories: [], priceMin: null, priceMax: null, sortBy: "default" } };
    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.payload };
    case "TOGGLE_CART_DRAWER":
      return { ...state, cartDrawerOpen: action.payload ?? !state.cartDrawerOpen };
    case "SET_SELECTED_PRODUCT":
      return { ...state, selectedProduct: action.payload };
    case "SET_CHECKOUT_STEP":
      return { ...state, checkoutStep: action.payload };
    case "SET_CHECKOUT_ADDRESS":
      return { ...state, checkoutData: { ...state.checkoutData, address: { ...state.checkoutData.address, ...action.payload } } };
    case "SET_CHECKOUT_PAYMENT":
      return { ...state, checkoutData: { ...state.checkoutData, paymentMethod: action.payload.method } };
    case "SET_TERMS_ACCEPTED":
      return { ...state, checkoutData: { ...state.checkoutData, termsAccepted: action.payload } };
    case "CONFIRM_ORDER": {
      const { orderId, order, discount, total } = action.payload;
      const updatedProducts = state.products.map(p => {
        const item = order.items.find(i => i.productId === p.id);
        return item ? { ...p, stock: Math.max(0, p.stock - item.quantity) } : p;
      });
      return {
        ...state,
        orders: [...state.orders, { ...order, id: orderId }],
        products: updatedProducts,
        cart: [],
        cartDrawerOpen: false,
        orderSuccess: { orderId, total, paymentMethod: order.paymentMethod },
        checkoutStep: 1,
        checkoutData: defaultCheckoutData,
      };
    }
    case "CANCEL_ORDER": {
      const order = state.orders.find(o => o.id === action.payload);
      if (!order || order.status !== "pending") return state;
      const updatedProducts = state.products.map(p => {
        const item = order.items.find(i => i.productId === p.id);
        return item ? { ...p, stock: p.stock + item.quantity } : p;
      });
      return {
        ...state,
        orders: state.orders.map(o => o.id === action.payload ? { ...o, status: "cancelled" } : o),
        products: updatedProducts,
      };
    }
    case "REORDER": {
      const order = state.orders.find(o => o.id === action.payload);
      if (!order) return state;
      let newCart = [...state.cart];
      for (const item of order.items) {
        const product = state.products.find(p => p.id === item.productId);
        if (!product || product.stock === 0) continue;
        const qty = Math.min(item.quantity, product.stock);
        const existing = newCart.find(i => i.productId === item.productId);
        if (existing) {
          newCart = newCart.map(i => i.productId === item.productId ? { ...i, quantity: Math.min(existing.quantity + qty, product.stock) } : i);
        } else {
          newCart = [...newCart, { productId: item.productId, quantity: qty }];
        }
      }
      return { ...state, cart: newCart };
    }
    case "SET_ORDERS_FILTER":
      return { ...state, ordersFilter: action.payload };
    case "CLEAR_CHECKOUT":
      return { ...state, checkoutStep: 1, checkoutData: defaultCheckoutData, orderSuccess: null };
    case "ORDER_SUCCESS":
      return {
        ...state,
        cart: [],
        cartDrawerOpen: false,
        orderSuccess: action.payload,
        checkoutStep: 1,
        checkoutData: defaultCheckoutData,
      };
    case "SET_PRODUCTS":
      return { ...state, products: (action.payload || []).map(p => ({ ...p, tags: p.tags || [] })) };
    case "SET_ORDERS":
      return { ...state, orders: (action.payload || []).map(o => ({
        id: o.id,
        userId: o.user_id || o.userId,
        items: (o.items || []).map(it => ({ productId: it.productId, name: it.productName || it.name, quantity: it.quantity, price: it.unitPrice || it.price })),
        total: o.total,
        status: o.status,
        paymentMethod: o.payment_method || o.paymentMethod,
        address: typeof o.address === "string" ? JSON.parse(o.address || "{}") : (o.address || {}),
        createdAt: o.created_at || o.createdAt,
      })) };
    case "ADD_ORDER":
      return { ...state, orders: [action.payload, ...state.orders] };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_API_ERROR":
      return { ...state, apiError: action.payload };
    case "SET_ADMIN_PAGE":
      return { ...state, adminPage: action.payload };
    case "SET_ADMIN_PRODUCTS":
      return { ...state, adminProducts: action.payload || [] };
    case "SET_ADMIN_USERS":
      return { ...state, adminUsers: action.payload || [] };
    case "SET_INVENTORY":
      return { ...state, inventory: action.payload };
    case "SET_CHAT_CONVERSATIONS":
      return { ...state, chatConversations: action.payload || [] };
    case "SET_CHAT_MESSAGES":
      return { ...state, chatMessages: action.payload || [] };
    case "SET_CHAT_OPEN":
      return { ...state, chatOpen: action.payload };
    case "SET_ACTIVE_CHAT":
      return { ...state, activeChatId: action.payload };
    case "SET_CHAT_UNREAD":
      return { ...state, chatUnreadCount: action.payload || 0 };
    case "SET_CHAT_LOADING":
      return { ...state, chatLoading: action.payload };
    case "ADD_CHAT_MESSAGE":
      return { ...state, chatMessages: [...state.chatMessages, action.payload] };
    case "SET_NEW_CHAT_SUBJECT":
      return { ...state, newChatSubject: action.payload };
    case "SET_NEW_CHAT_MESSAGE":
      return { ...state, newChatMessage: action.payload };
    case "SET_PROFILE_PAGE":
      return { ...state, profilePage: action.payload };
    case "SET_SMS_STEP":
      return { ...state, smsStep: action.payload };
    case "SET_SMS_PENDING_PHONE":
      return { ...state, smsPendingPhone: action.payload };
    case "SET_SMS_CODE":
      return { ...state, smsCode: action.payload };
    case "SET_SMS_ERROR":
      return { ...state, smsError: action.payload };
    case "SET_SMS_COUNTDOWN":
      return { ...state, smsCountdown: action.payload };
    case "SET_SMS_MOCK_CODE":
      return { ...state, smsMockCode: action.payload };
    case "SET_PROFILE_LOADING":
      return { ...state, profileLoading: action.payload };
    case "SET_PROFILE_DATA":
      return { ...state, profileData: action.payload };
    case "UPDATE_PROFILE_FIELD":
      return { ...state, profileData: { ...(state.profileData || {}), ...action.payload } };
    case "SET_PIX_CONFIG":
      return { ...state, pixConfig: action.payload };
    case "SET_PIX_QR_DATA":
      return { ...state, pixQrData: action.payload };
    case "SET_PIX_LOADING":
      return { ...state, pixLoading: action.payload };
    case "SET_ADMIN_PIX_FORM":
      return { ...state, adminPixForm: { ...state.adminPixForm, ...(action.payload || {}) } };
    case "SET_ADMIN_PIX_SAVING":
      return { ...state, adminPixSaving: action.payload };
    case "SET_ADMIN_PIX_LOADED":
      return { ...state, adminPixLoaded: action.payload };
    case "SET_STORE_ICON":
      return { ...state, storeIcon: action.payload || "Store", storeIconLoaded: true };
    case "SET_SITE_CONFIG":
      return { ...state, siteConfig: action.payload || null, siteConfigLoaded: true };
    case "UPDATE_ADMIN_PRODUCT": {
      const p = action.payload;
      const upd = (list) => list.map(x => x.id === p.id ? { ...x, ...p } : x);
      return { ...state, adminProducts: upd(state.adminProducts), products: upd(state.products) };
    }
    case "UPDATE_ADMIN_USER": {
      const u = action.payload;
      return { ...state, adminUsers: state.adminUsers.map(x => x.id === u.id ? { ...x, ...u } : x) };
    }
    default:
      return state;
  }
}

const AppContext = createContext(null);

function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}

/** Som curto e suave para novo pedido (Web Audio API). */
function playNewOrderChime() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const playTone = (freq, startSec, durationSec) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t0 = ctx.currentTime + startSec;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.1, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
      osc.start(t0);
      osc.stop(t0 + durationSec + 0.05);
    };
    playTone(659.25, 0, 0.22);
    playTone(783.99, 0.16, 0.24);
    playTone(987.77, 0.38, 0.32);
    void ctx.resume?.();
  } catch {
    /* ignore */
  }
}

const IDLE_LOGOUT_MS = 2 * 60 * 1000;

function useIdleLogout(active, dispatch) {
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  useEffect(() => {
    if (!active) return;
    let timeoutId;
    const reset = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        sessionStorage.removeItem("novamart_token");
        dispatchRef.current({ type: "LOGOUT" });
        dispatchRef.current({
          type: "ADD_TOAST",
          payload: { type: "warning", message: "Sessão encerrada por inatividade (2 minutos)." },
        });
      }, IDLE_LOGOUT_MS);
    };
    reset();
    const events = ["mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timeoutId);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [active]);
}

function AdminOrderNotifier() {
  const { state, dispatch } = useApp();
  const [popup, setPopup] = useState(null);
  const bootRef = useRef(false);
  const lastIdRef = useRef(null);

  useEffect(() => {
    if (state.currentUser?.role !== "admin") {
      bootRef.current = false;
      lastIdRef.current = null;
      setPopup(null);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const data = await api("/orders/admin/latest", {}, dispatch);
        const id = data.latestOrderId;
        if (id == null) return;
        if (!bootRef.current) {
          bootRef.current = true;
          lastIdRef.current = id;
          return;
        }
        if (id !== lastIdRef.current && data.latest) {
          lastIdRef.current = id;
          setPopup(data.latest);
          playNewOrderChime();
        }
      } catch {
        /* 401 já desloga via api() */
      }
    };

    poll();
    const t = setInterval(poll, 20000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [state.currentUser?.role, state.currentUser?.id, dispatch]);

  if (!popup) return null;

  const totalFmt =
    typeof popup.total === "number"
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(popup.total)
      : String(popup.total ?? "");
  const when = popup.createdAt
    ? new Date(popup.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md rounded-2xl border border-emerald-500/30 shadow-2xl p-6 space-y-4"
        style={{ background: "rgba(15,23,42,0.95)" }}
        role="dialog"
        aria-labelledby="new-order-title"
      >
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-2xl shrink-0">🔔</div>
          <div>
            <h2 id="new-order-title" className="text-lg font-semibold text-white">
              Novo pedido recebido
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              {popup.userName ? (
                <>
                  <span className="text-zinc-200">{popup.userName}</span>
                  {popup.userEmail ? <span className="text-zinc-500"> · {popup.userEmail}</span> : null}
                </>
              ) : (
                "Um cliente acabou de finalizar um pedido."
              )}
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2 text-sm">
          <div className="flex justify-between text-zinc-400">
            <span>Pedido</span>
            <span className="text-white font-mono">#{String(popup.id).slice(0, 12)}</span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>Total</span>
            <span className="text-emerald-300 font-semibold">{totalFmt}</span>
          </div>
          {when ? (
            <div className="flex justify-between text-zinc-400">
              <span>Data</span>
              <span className="text-zinc-300">{when}</span>
            </div>
          ) : null}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={() => setPopup(null)}
            className="px-4 py-2.5 rounded-xl border border-white/15 text-zinc-300 text-sm hover:bg-white/5"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => {
              setPopup(null);
              dispatch({ type: "SET_ADMIN_PAGE", payload: "overview" });
              dispatch({ type: "NAVIGATE", payload: "admin-dashboard" });
            }}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500"
          >
            Abrir painel
          </button>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatBRL(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function hexToRgba(hex, alpha = 1) {
  const h = String(hex || "").trim();
  if (!h.startsWith("#")) return `rgba(255,255,255,${alpha})`;
  let c = h.slice(1);
  if (c.length === 3) c = c.split("").map((ch) => ch + ch).join("");
  if (c.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getButtonPrimaryGradientStyle(siteConfig) {
  const from = siteConfig?.btnPrimaryFrom || siteConfig?.primaryColor || "#7c3aed";
  const to = siteConfig?.btnPrimaryTo || siteConfig?.secondaryColor || "#6366f1";
  return { backgroundImage: `linear-gradient(90deg, ${from}, ${to})` };
}

function getButtonSecondaryStyle(siteConfig) {
  const color = siteConfig?.btnSecondary || siteConfig?.secondaryColor || "#7c3aed";
  return { backgroundColor: color };
}

function getSiteBackgroundStyle(siteConfig) {
  const top = siteConfig?.backgroundTopColor || "#0a0a14";
  const bottom = siteConfig?.backgroundBottomColor || "#0f0f1a";
  const bgImg = siteConfig?.backgroundImageUrl || "";
  const imageOpacityRaw = siteConfig?.backgroundImageOpacity;
  const imageOpacity = typeof imageOpacityRaw === "string" ? parseFloat(imageOpacityRaw) : Number(imageOpacityRaw);
  const safeImageOpacity = Number.isNaN(imageOpacity) ? 0.35 : Math.min(1, Math.max(0, imageOpacity));
  // Interpretação do admin (slider): 0% = imagem mais visível, 100% = imagem mais transparente.
  // Para simular isso usando overlay, quanto maior o valor, mais o overlay cobre a imagem.
  const overlayAlpha = safeImageOpacity;

  if (bgImg) {
    return {
      // Usamos um overlay (linear-gradient) para simular "transparência" da imagem de fundo.
      backgroundImage: `linear-gradient(180deg, ${hexToRgba(top, overlayAlpha)} 0%, ${hexToRgba(bottom, overlayAlpha)} 100%), url(${bgImg})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundColor: top,
    };
  }

  return {
    background: `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)`,
  };
}

const STATUS_CONFIG = {
  pending: { label: "Pendente", color: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700" },
  confirmed: { label: "Confirmado", color: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700" },
  shipped: { label: "Enviado", color: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-700" },
  delivered: { label: "Entregue", color: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-700" },
  cancelled: { label: "Cancelado", color: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-700" },
};

const CEP_FAKE = {
  "01234-567": { street: "Rua das Flores", neighborhood: "Centro", city: "São Paulo", state: "SP" },
  "04567-890": { street: "Av. Paulista", neighborhood: "Bela Vista", city: "São Paulo", state: "SP" },
  "20040-020": { street: "Rua da Assembleia", neighborhood: "Centro", city: "Rio de Janeiro", state: "RJ" },
};

function getNextOrderId(orders) {
  const nums = orders.map(o => parseInt(o.id.replace("ORD-", ""), 10));
  const next = (Math.max(0, ...nums) + 1).toString().padStart(3, "0");
  return `ORD-${next}`;
}

function checkoutTotals(cart, products) {
  const cartItems = cart
    .map(i => ({ ...i, product: products.find(p => p.id === i.productId) }))
    .filter(i => i.product);
  const subtotal = cartItems.reduce((s, i) => s + i.product.price * i.quantity, 0);
  // Frete fixo (sem frete grátis por faixa)
  const shipping = 15;
  const total = subtotal + shipping;
  return { cartItems, subtotal, shipping, total };
}

function maskCEP(v) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PRODUCT IMAGE (emoji ou upload real)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ProductImage({ product, size = "md", className = "" }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const isRealImage = product?.image && String(product.image).startsWith("/");
  const sizeClasses = { sm: "w-16 h-16 text-2xl", md: "h-48 text-6xl", lg: "h-56 sm:h-64 text-7xl" };
  const sizeClass = sizeClasses[size] || sizeClasses.md;

  if (!product) return null;
  if (!isRealImage || error) {
    return (
      <div className={`${sizeClass} bg-gradient-to-br ${product.gradient || "from-violet-500 to-indigo-600"} flex items-center justify-center rounded-xl overflow-hidden flex-shrink-0 ${className}`}>
        <span>{product.image || getDefaultEmoji(product.category)}</span>
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden rounded-xl flex-shrink-0 ${sizeClass} ${className}`}>
      {!loaded && <div className="absolute inset-0 bg-zinc-800 animate-pulse" />}
      <img
        src={product.image}
        alt={product.name}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TOAST SYSTEM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ToastContainer() {
  const { state, dispatch } = useApp();
  const [exiting, setExiting] = useState(new Set());

  useEffect(() => {
    const timers = state.toasts.map(t => {
      const id = setTimeout(() => {
        setExiting(s => new Set(s).add(t.id));
        setTimeout(() => dispatch({ type: "REMOVE_TOAST", payload: t.id }), 250);
      }, 3500);
      return { id, toastId: t.id };
    });
    return () => timers.forEach(({ id }) => clearTimeout(id));
  }, [state.toasts, dispatch]);

  const ToastIcon = ({ type }) => {
    if (type === "success") return <CheckCircle size={18} className="text-emerald-600 shrink-0" />;
    if (type === "error") return <XCircle size={18} className="text-rose-600 shrink-0" />;
    if (type === "warning") return <AlertTriangle size={18} className="text-amber-600 shrink-0" />;
    return <Info size={18} className="text-indigo-600 shrink-0" />;
  };

  if (!state.toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-[360px]" aria-live="polite">
      {state.toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border backdrop-blur-sm text-sm font-medium transition-all duration-250 ${
            exiting.has(toast.id) ? "animate-slide-out opacity-0" : "animate-slide-in"
          } ${
            toast.type === "success" ? "bg-emerald-50/95 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-200 dark:border-emerald-700" :
            toast.type === "error" ? "bg-rose-50/95 text-rose-800 border-rose-200 dark:bg-rose-900/20 dark:text-rose-200 dark:border-rose-700" :
            toast.type === "warning" ? "bg-amber-50/95 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-700" :
            "bg-white/95 text-zinc-800 border-zinc-200 dark:bg-zinc-800/95 dark:text-zinc-200 dark:border-zinc-600"
          }`}
        >
          <ToastIcon type={toast.type} />
          <div className="flex-1 min-w-0">
            {toast.productName && (
              <p className="font-semibold truncate flex items-center gap-1.5">
                {toast.productEmoji && <span>{toast.productEmoji}</span>}
                {toast.productName}
              </p>
            )}
            <span className={toast.productName ? "text-xs opacity-90" : ""}>{toast.message}</span>
          </div>
          <button onClick={() => dispatch({ type: "REMOVE_TOAST", payload: toast.id })} className="opacity-50 hover:opacity-100 p-1 rounded" aria-label="Fechar">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PRODUCT DETAIL MODAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ProductDetailModal() {
  const { state, dispatch } = useApp();
  const [qty, setQty] = useState(1);
  const product = state.products.find(p => p.id === state.selectedProduct);
  const related = product ? state.products.filter(p => p.active && p.category === product.category && p.id !== product.id).slice(0, 3) : [];

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") dispatch({ type: "SET_SELECTED_PRODUCT", payload: null }); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dispatch]);

  useEffect(() => { if (product) setQty(1); }, [product?.id]);

  if (!product) return null;

  const addToCart = () => {
    if (state.currentUser?.role === "guest") {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Faça login para adicionar ao carrinho" } });
      return;
    }
    const amount = Math.min(qty, product.stock);
    dispatch({ type: "ADD_TO_CART", payload: { productId: product.id, quantity: amount } });
    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: amount > 1 ? `${amount} unidades adicionadas ao carrinho!` : "Adicionado ao carrinho!", productName: product.name, productEmoji: product.image } });
    dispatch({ type: "SET_SELECTED_PRODUCT", payload: null });
  };

  const stockBar = product.stock === 0 ? "bg-rose-500" : product.stock <= 10 ? "bg-amber-500" : "bg-emerald-500";
  const stockWidth = product.stock === 0 ? 0 : Math.min(100, (product.stock / 25) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-overlay-in" onClick={() => dispatch({ type: "SET_SELECTED_PRODUCT", payload: null })} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 shadow-2xl animate-modal-in bg-zinc-900">
        <button onClick={() => dispatch({ type: "SET_SELECTED_PRODUCT", payload: null })} className="absolute top-4 right-4 z-10 p-2 rounded-xl bg-black/40 text-white hover:bg-black/60 transition-colors" aria-label="Fechar">
          <X size={20} />
        </button>
        <ProductImage product={product} size="lg" className="w-full rounded-t-2xl" />
        <div className="p-6">
          <span className="inline-block px-2.5 py-1 rounded-lg bg-violet-500/20 text-violet-300 text-xs font-medium mb-2">{product.category}</span>
          <h2 id="modal-title" className="text-xl font-bold text-white mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>{product.name}</h2>
          <p className="text-zinc-400 text-sm mb-4">{product.description}</p>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {product.originalPrice && (
              <span className="text-zinc-500 line-through text-sm">{formatBRL(product.originalPrice)}</span>
            )}
            <span className="text-2xl font-bold text-white">{formatBRL(product.price)}</span>
          </div>
          <div className="mb-4">
            <p className="text-xs text-zinc-500 mb-1">Estoque</p>
            <div className="h-2 rounded-full bg-zinc-700 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${stockBar}`} style={{ width: `${stockWidth}%` }} />
            </div>
            <p className="text-xs text-zinc-400 mt-1">{product.stock === 0 ? "Esgotado" : product.stock <= 10 ? `${product.stock} unidades` : "Em estoque"}</p>
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center rounded-xl border border-white/10 overflow-hidden">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-10 h-10 flex items-center justify-center bg-white/5 text-white hover:bg-white/10 transition-colors" aria-label="Diminuir quantidade">−</button>
              <span className="w-12 text-center text-white font-medium text-sm">{qty}</span>
              <button onClick={() => setQty(Math.min(product.stock, qty + 1))} disabled={qty >= product.stock} className="w-10 h-10 flex items-center justify-center bg-white/5 text-white hover:bg-white/10 disabled:opacity-30 transition-colors" aria-label="Aumentar quantidade">+</button>
            </div>
            <button onClick={addToCart} disabled={product.stock === 0}
              style={getButtonPrimaryGradientStyle(state.siteConfig)}
              className="flex-1 py-3 rounded-xl text-white font-semibold text-sm shadow-lg transition-all flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50">
              <ShoppingCart size={18} /> Adicionar ao Carrinho
            </button>
          </div>
          {related.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Produtos relacionados</h3>
              <div className="flex gap-2">
                {related.map(p => (
                  <button key={p.id} onClick={() => dispatch({ type: "SET_SELECTED_PRODUCT", payload: p.id })} className="flex-1 flex items-center gap-2 p-2 rounded-xl border border-white/10 hover:border-violet-500/30 hover:bg-white/5 transition-all text-left">
                    <ProductImage product={p} size="sm" className="!w-10 !h-10 rounded-lg shrink-0" />
                    <span className="text-xs text-white font-medium truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CART DRAWER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CartDrawer() {
  const { state, dispatch } = useApp();
  const cartItems = state.cart.map(item => {
    const product = state.products.find(p => p.id === item.productId);
    return { ...item, product };
  }).filter(i => i.product);

  const subtotal = cartItems.reduce((sum, i) => sum + (i.product?.price ?? 0) * i.quantity, 0);
  const shipping = 15;
  const total = subtotal + shipping;

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") dispatch({ type: "TOGGLE_CART_DRAWER", payload: false }); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dispatch]);

  if (!state.cartDrawerOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-overlay-in" onClick={() => dispatch({ type: "TOGGLE_CART_DRAWER", payload: false })} aria-hidden="true" />
      <div className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-[420px] bg-zinc-900 border-l border-white/10 shadow-2xl flex flex-col animate-drawer-in overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>Carrinho</h2>
          <button onClick={() => dispatch({ type: "TOGGLE_CART_DRAWER", payload: false })} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors" aria-label="Fechar carrinho">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {cartItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="text-6xl mb-4">🛒</span>
              <p className="text-zinc-400 font-medium mb-2">Seu carrinho está vazio</p>
              <p className="text-zinc-500 text-sm mb-6">Adicione produtos para começar</p>
              <button onClick={() => { dispatch({ type: "TOGGLE_CART_DRAWER", payload: false }); dispatch({ type: "NAVIGATE", payload: "home" }); }}
                style={getButtonPrimaryGradientStyle(state.siteConfig)}
                className="px-6 py-3 rounded-xl text-white font-medium text-sm transition-all shadow-lg shadow-black/30 hover:opacity-95">
                Explorar produtos
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {cartItems.map(({ product, quantity }) => {
                const atMax = quantity >= product.stock;
                const stockChanged = product.stock < quantity;
                return (
                  <li key={product.id} className="flex gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.02] group">
                    <ProductImage product={product} size="sm" className="!w-14 !h-14 rounded-xl shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{product.name}</p>
                      <p className="text-zinc-500 text-xs">{formatBRL(product.price)} un.</p>
                      {stockChanged && (
                        <p className="text-amber-400 text-xs mt-1">Estoque atualizado: máx {product.stock} unidades</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center rounded-lg border border-white/10 overflow-hidden">
                          <button onClick={() => dispatch({ type: "UPDATE_CART_QTY", payload: { productId: product.id, quantity: quantity - 1 } })} className="w-8 h-8 flex items-center justify-center bg-white/5 text-zinc-300 hover:bg-white/10 text-sm">−</button>
                          <span className="w-8 text-center text-white text-sm font-medium">{quantity}</span>
                          <button onClick={() => dispatch({ type: "UPDATE_CART_QTY", payload: { productId: product.id, quantity: quantity + 1 } })} disabled={atMax} className="w-8 h-8 flex items-center justify-center bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-30 text-sm">+</button>
                        </div>
                        <span className="text-white font-semibold text-sm">{formatBRL(product.price * quantity)}</span>
                      </div>
                    </div>
                    <button onClick={() => dispatch({ type: "REMOVE_FROM_CART", payload: product.id })} className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors self-start" aria-label="Remover do carrinho">
                      <Trash2 size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {cartItems.length > 0 && (
          <div className="border-t border-white/10 p-4 bg-zinc-900/95">
            <div className="flex justify-between text-white font-bold text-lg mb-4">
              <span>Subtotal</span>
              <span>{formatBRL(subtotal)}</span>
            </div>
            <div className="flex justify-between text-zinc-400 text-sm mb-2">
              <span>Frete</span>
              <span className={shipping === 0 ? "text-emerald-400" : ""}>{formatBRL(shipping)}</span>
            </div>
            <div className="flex justify-between text-white font-bold text-base mb-3">
              <span>Total</span>
              <span>{formatBRL(total)}</span>
            </div>
            <button onClick={() => { dispatch({ type: "TOGGLE_CART_DRAWER", payload: false }); dispatch({ type: "NAVIGATE", payload: "checkout" }); }}
              style={getButtonPrimaryGradientStyle(state.siteConfig)}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm shadow-lg shadow-black/30 hover:opacity-95 transition-all flex items-center justify-center gap-2 mb-2">
              Finalizar Pedido <ArrowRight size={16} />
            </button>
            <button onClick={() => { dispatch({ type: "TOGGLE_CART_DRAWER", payload: false }); dispatch({ type: "NAVIGATE", payload: "cart" }); }}
              className="w-full py-2.5 rounded-xl border border-white/10 text-zinc-400 text-sm font-medium hover:bg-white/5 transition-all">
              Ver carrinho completo
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHECKOUT PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CheckoutSidebar({ cartItems, subtotal, shipping, total, collapsed, onToggle }) {
  const itemCount = cartItems.reduce((s, i) => s + i.quantity, 0);
  return (
    <div className="lg:sticky lg:top-24 self-start w-full lg:w-[340px] rounded-2xl border border-white/[0.08] overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
      <button onClick={onToggle} className="lg:hidden w-full flex items-center justify-between p-4 text-left border-b border-white/10">
        <span className="text-white font-semibold">Resumo do Pedido</span>
        <span className="text-zinc-400 text-sm">{itemCount} {itemCount === 1 ? "item" : "itens"}</span>
        <span className="text-zinc-500 text-sm">{collapsed ? "Ver resumo ▼" : "Ocultar resumo ▲"}</span>
      </button>
      <div className={`p-4 ${collapsed ? "max-lg:hidden lg:block" : ""}`}>
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            Resumo do Pedido <span className="text-xs font-normal text-zinc-500">({itemCount} itens)</span>
          </h3>
          <ul className="space-y-2 mb-4 max-h-48 overflow-y-auto">
            {cartItems.map(({ product, quantity }) => (
              <li key={product.id} className="flex items-center gap-2 text-sm">
                <ProductImage product={product} size="sm" className="!w-8 !h-8 rounded-lg shrink-0 inline-flex" />
                <span className="text-zinc-300 truncate flex-1">{product.name}</span>
                <span className="text-zinc-500">×{quantity}</span>
                <span className="text-white font-medium">{formatBRL(product.price * quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-white/10 pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-zinc-400"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
            <div className="flex justify-between text-zinc-400"><span>Frete</span><span className={shipping === 0 ? "text-emerald-400" : ""}>{shipping === 0 ? "Grátis" : formatBRL(shipping)}</span></div>
            <div className="flex justify-between text-white font-bold text-lg pt-2"><span>Total</span><span>{formatBRL(total)}</span></div>
          </div>
        </div>
    </div>
  );
}

function CheckoutPage() {
  const { state, dispatch } = useApp();
  const [addressForm, setAddressForm] = useState(() => ({ ...state.checkoutData.address }));
  const [addressErrors, setAddressErrors] = useState({});
  const [cepLoading, setCepLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const formRef = useRef(null);

  const cartItems = state.cart.map(i => ({ ...i, product: state.products.find(p => p.id === i.productId) })).filter(i => i.product);
  const { subtotal, shipping, total } = checkoutTotals(state.cart, state.products);

  const didMountRedirect = useRef(false);

  useEffect(() => {
    setAddressForm(a => ({ ...a, ...state.checkoutData.address }));
  }, [state.checkoutStep]);

  useEffect(() => {
    if (
      state.profileData?.save_address &&
      state.profileData?.default_address &&
      !addressForm.zip
    ) {
      const saved = typeof state.profileData.default_address === "string"
        ? (() => { try { return JSON.parse(state.profileData.default_address || "{}"); } catch { return {}; } })()
        : state.profileData.default_address;
      if (saved) {
        setAddressForm(a => ({ ...a, ...saved }));
        dispatch({ type: "SET_CHECKOUT_ADDRESS", payload: saved });
        dispatch({
          type: "ADD_TOAST",
          payload: { type: "info", message: "Endereço salvo foi pré-preenchido. Confira os dados antes de continuar." },
        });
      }
    }
    // executar apenas no primeiro render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.currentUser?.role === "guest") {
      dispatch({ type: "NAVIGATE", payload: "auth" });
      dispatch({ type: "ADD_TOAST", payload: { type: "warning", message: "Faça login para finalizar a compra" } });
    }
  }, [state.currentUser?.role, dispatch]);

  useEffect(() => {
    if (!didMountRedirect.current) {
      didMountRedirect.current = true;
      return;
    }
    if (state.cart.length === 0 && !state.orderSuccess && state.currentUser?.role !== "guest") {
      dispatch({ type: "NAVIGATE", payload: "home" });
    }
  }, [state.cart.length, state.orderSuccess, state.currentUser?.role, dispatch]);

  if (state.currentUser?.role === "guest") return null;
  if (state.cart.length === 0 && !state.orderSuccess) return null;

  const stockIssues = cartItems.filter(i => i.product.stock < i.quantity || i.product.stock === 0);
  const canProceed = stockIssues.length === 0;

  const steps = [
    { n: 1, label: "Endereço de Entrega", icon: "📍" },
    { n: 2, label: "Revisão e Confirmação", icon: "✅" },
  ];

  const validateAddress = () => {
    const e = {};
    const zip = addressForm.zip.replace(/\D/g, "");
    if (!zip || zip.length !== 8) e.zip = "CEP inválido (8 dígitos)";
    if (!addressForm.street.trim()) e.street = "Obrigatório";
    if (!addressForm.number.trim()) e.number = "Obrigatório";
    if (!addressForm.neighborhood.trim()) e.neighborhood = "Obrigatório";
    if (!addressForm.city.trim()) e.city = "Obrigatório";
    if (!addressForm.state) e.state = "Selecione o estado";
    setAddressErrors(e);
    if (Object.keys(e).length) formRef.current?.querySelector("[data-error]")?.scrollIntoView({ behavior: "smooth" });
    return Object.keys(e).length === 0;
  };

  const handleCepSearch = async () => {
    const digits = addressForm.zip.replace(/\D/g, "");
    if (digits.length !== 8) {
      setAddressErrors({ zip: "CEP inválido (8 dígitos)" });
      return;
    }

    setCepLoading(true);
    try {
      const cepData = await api(`/cep/${digits}`, {}, dispatch);
      const maskedZip = cepData?.zip || maskCEP(digits);

      const next = {
        ...addressForm,
        zip: maskedZip,
        street: cepData?.street || "",
        neighborhood: cepData?.neighborhood || "",
        city: cepData?.city || "",
        state: cepData?.state || "",
      };

      setAddressForm(next);
      dispatch({ type: "SET_CHECKOUT_ADDRESS", payload: next });
      setAddressErrors({});
    } catch (err) {
      const msg = err?.message || "Não foi possível buscar o CEP.";
      setAddressErrors({ zip: msg.includes("não encontrado") ? "CEP não encontrado" : msg });
    } finally {
      setCepLoading(false);
    }
  };

  const validatePayment = () => true;

  const userPastAddresses = state.orders
    .filter(o => o.userId === state.currentUser?.id && o.address)
    .map(o => o.address)
    .filter((a, i, arr) => arr.findIndex(x => x.zip === a.zip && x.number === a.number) === i);

  const goNext = () => {
    if (state.checkoutStep === 1) {
      if (!validateAddress()) return;
      dispatch({ type: "SET_CHECKOUT_ADDRESS", payload: addressForm });
    }
    if (state.checkoutStep < 2) {
      dispatch({ type: "SET_CHECKOUT_STEP", payload: state.checkoutStep + 1 });
    }
  };

  const goBack = () => dispatch({ type: "SET_CHECKOUT_STEP", payload: state.checkoutStep - 1 });

  const handleConfirmOrder = async () => {
    if (!state.checkoutData.termsAccepted) return;
    setConfirmLoading(true);
    const addr = state.checkoutData.address;
    const address = { street: addr.street, number: addr.number, complement: addr.complement || "", neighborhood: addr.neighborhood, city: addr.city, state: addr.state, zip: addr.zip };
    const body = {
      items: cartItems.map(({ productId, quantity }) => ({ productId, quantity })),
      paymentMethod: "pix",
      address,
      discount: 0,
      shipping,
    };
    try {
      const data = await api("/orders", { method: "POST", body }, dispatch);
      const order = data.order;
      if (order) {
        let qrData = null;
        try {
          qrData = await api("/settings/pix/generate", {
            method: "POST",
            body: { amount: order.total, txId: order.id, description: `Pedido ${order.id}` },
          }, dispatch);
        } catch {
          // geração de QR é best-effort
        }
        dispatch({ type: "SET_PIX_QR_DATA", payload: qrData });
        dispatch({ type: "ADD_ORDER", payload: mapApiOrderToState(order) });
        dispatch({ type: "ORDER_SUCCESS", payload: { orderId: order.id, total: order.total, paymentMethod: "pix" } });
        dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Pedido realizado! Efetue o pagamento via PIX." } });
        api("/products", {}, dispatch).then(d => d.products && dispatch({ type: "SET_PRODUCTS", payload: d.products })).catch(() => {});
      }
    } catch (err) {
      const msg = err.data?.unavailable?.length ? "Alguns itens não estão disponíveis. Ajuste o carrinho." : (err.message || "Erro ao criar pedido.");
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: msg } });
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-24" style={getSiteBackgroundStyle(state.siteConfig)}>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6" style={{ fontFamily: "'Outfit', sans-serif" }}>Checkout</h1>

        {!canProceed && (
          <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm">
            Alguns itens têm estoque insuficiente. Ajuste as quantidades no carrinho ou remova os itens.
          </div>
        )}

        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {steps.map((step, i) => {
            const active = state.checkoutStep === step.n;
            const done = state.checkoutStep > step.n;
            return (
              <div key={step.n} className="flex items-center shrink-0">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${active ? "bg-violet-500/20 border-violet-500 text-violet-300" : done ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "border-white/10 text-zinc-500"}`}>
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold bg-current/20">{done ? <CheckCircle size={14} /> : step.n}</span>
                  <span className="text-sm font-medium hidden sm:inline">{step.label}</span>
                </div>
                {i < steps.length - 1 && <div className={`w-6 h-0.5 mx-1 rounded ${done ? "bg-emerald-500/50" : "bg-zinc-700"}`} />}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 space-y-6" ref={formRef}>
            {state.checkoutStep === 1 && (
              <div className="rounded-2xl border border-white/[0.08] p-6" style={{ background: "rgba(255,255,255,0.03)" }}>
                <h2 className="text-lg font-semibold text-white mb-4">Endereço de Entrega</h2>
                {userPastAddresses.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-zinc-500 uppercase mb-2">Usar endereço salvo</p>
                    {userPastAddresses.map((addr, idx) => (
                      <label key={idx} className="flex items-center gap-3 p-3 rounded-xl border border-white/10 mb-2 cursor-pointer hover:bg-white/5">
                        <input type="radio" name="saved" checked={addressForm.zip === addr.zip && addressForm.number === addr.number} onChange={() => { const a = addr; setAddressForm({ zip: a.zip || "", street: a.street || "", number: a.number || "", complement: a.complement || "", neighborhood: a.neighborhood || "", city: a.city || "", state: a.state || "" }); }} className="text-violet-500" />
                        <span className="text-zinc-300 text-sm">{addr.street}, {addr.number} — {addr.neighborhood || ""}, {addr.city}/{addr.state}</span>
                      </label>
                    ))}
                    <p className="text-xs text-zinc-500 mt-2">Ou preencha um novo endereço abaixo.</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div data-error={addressErrors.zip}>
                    <label className="block text-xs text-zinc-500 mb-1">CEP</label>
                    <div className="relative max-w-xs">
                      <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input value={addressForm.zip} onChange={e => setAddressForm(f => ({ ...f, zip: maskCEP(e.target.value) }))} placeholder="00000-000" className={`w-full pl-10 pr-12 py-3 rounded-xl bg-white/5 border text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${addressErrors.zip ? "border-rose-500/50" : "border-white/10"}`} />
                      <button type="button" onClick={handleCepSearch} disabled={cepLoading} style={getButtonPrimaryGradientStyle(state.siteConfig)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-white hover:opacity-95 disabled:opacity-50">
                        {cepLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search size={14} />}
                      </button>
                    </div>
                    {addressErrors.zip && <p className="text-rose-400 text-xs mt-1">{addressErrors.zip}</p>}
                  </div>
                  <div data-error={addressErrors.number}>
                    <label className="block text-xs text-zinc-500 mb-1">Número</label>
                    <div className="relative max-w-[120px]">
                      <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input value={addressForm.number} onChange={e => setAddressForm(f => ({ ...f, number: e.target.value }))} placeholder="Nº" className={`w-full pl-10 pr-3 py-3 rounded-xl bg-white/5 border text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${addressErrors.number ? "border-rose-500/50" : "border-white/10"}`} />
                    </div>
                    {addressErrors.number && <p className="text-rose-400 text-xs mt-1">{addressErrors.number}</p>}
                  </div>
                </div>
                <div className="mt-4 space-y-4">
                  <div data-error={addressErrors.street}>
                    <label className="block text-xs text-zinc-500 mb-1">Rua / Logradouro</label>
                    <div className="relative">
                      <Home size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input value={addressForm.street} onChange={e => setAddressForm(f => ({ ...f, street: e.target.value }))} className={`w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${addressErrors.street ? "border-rose-500/50" : "border-white/10"}`} />
                    </div>
                    {addressErrors.street && <p className="text-rose-400 text-xs mt-1">{addressErrors.street}</p>}
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Complemento</label>
                    <input value={addressForm.complement} onChange={e => setAddressForm(f => ({ ...f, complement: e.target.value }))} placeholder="Apto, Bloco, etc." className="w-full pl-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div data-error={addressErrors.neighborhood}>
                      <label className="block text-xs text-zinc-500 mb-1">Bairro</label>
                      <div className="relative">
                        <Building size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input value={addressForm.neighborhood} onChange={e => setAddressForm(f => ({ ...f, neighborhood: e.target.value }))} className={`w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${addressErrors.neighborhood ? "border-rose-500/50" : "border-white/10"}`} />
                      </div>
                      {addressErrors.neighborhood && <p className="text-rose-400 text-xs mt-1">{addressErrors.neighborhood}</p>}
                    </div>
                    <div data-error={addressErrors.city}>
                      <label className="block text-xs text-zinc-500 mb-1">Cidade</label>
                      <div className="relative">
                        <Map size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input value={addressForm.city} onChange={e => setAddressForm(f => ({ ...f, city: e.target.value }))} className={`w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${addressErrors.city ? "border-rose-500/50" : "border-white/10"}`} />
                      </div>
                      {addressErrors.city && <p className="text-rose-400 text-xs mt-1">{addressErrors.city}</p>}
                    </div>
                  </div>
                  <div data-error={addressErrors.state}>
                    <label className="block text-xs text-zinc-500 mb-1">Estado</label>
                    <select value={addressForm.state} onChange={e => setAddressForm(f => ({ ...f, state: e.target.value }))} className={`w-full max-w-[140px] py-3 rounded-xl bg-white/5 border text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${addressErrors.state ? "border-rose-500/50" : "border-white/10"}`}>
                      <option value="">UF</option>
                      {BR_STATES.map(uf => <option key={uf} value={uf} className="bg-zinc-900">{uf}</option>)}
                    </select>
                    {addressErrors.state && <p className="text-rose-400 text-xs mt-1">{addressErrors.state}</p>}
                  </div>
                </div>
              </div>
            )}

            {state.checkoutStep === 2 && (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <Zap size={16} className="text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-semibold">Pagamento via PIX</p>
                      <p className="text-emerald-400 text-xs">Sem descontos. QR Code após confirmação.</p>
                    </div>
                  </div>
                  {state.pixConfig && state.pixConfig.configured === false && (
                    <p className="text-amber-400 text-xs mt-2">⚠️ Chave PIX ainda não configurada.</p>
                  )}
                  <p className="text-zinc-400 text-xs mt-2">
                    Após confirmar, você receberá um QR Code PIX. O pedido será processado quando o pagamento for identificado.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/[0.08] p-6" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <h2 className="text-lg font-semibold text-white mb-3">Itens do Pedido</h2>
                  <ul className="space-y-2">
                    {cartItems.map(({ product, quantity }) => (
                      <li key={product.id} className="flex items-center gap-3 text-sm">
                        <ProductImage product={product} size="sm" className="!w-10 !h-10 rounded-lg shrink-0 inline-flex" />
                        <span className="text-zinc-300 flex-1">{product.name}</span>
                        <span className="text-zinc-500">×{quantity}</span>
                        <span className="text-white">{formatBRL(product.price * quantity)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-white/[0.08] p-6" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <div className="space-y-1.5 text-sm mb-4">
                    <div className="flex justify-between text-zinc-400"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
                    <div className="flex justify-between text-zinc-400"><span>Frete</span><span className={shipping === 0 ? "text-emerald-400" : ""}>{shipping === 0 ? "Grátis" : formatBRL(shipping)}</span></div>
                    <div className="flex justify-between text-white font-bold text-xl pt-2"><span>Total</span><span>{formatBRL(total)}</span></div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer mb-4">
                    <input
                      type="checkbox"
                      checked={state.checkoutData.termsAccepted}
                      onChange={e => dispatch({ type: "SET_TERMS_ACCEPTED", payload: e.target.checked })}
                      className="rounded border-white/20 bg-white/5 text-violet-500"
                    />
                    <span className="text-zinc-400 text-sm">
                      Li e aceito os <button type="button" className="text-violet-400 hover:underline">Termos de Uso</button> e{" "}
                      <button type="button" className="text-violet-400 hover:underline">Política de Privacidade</button>.
                    </span>
                  </label>

                  <button
                    onClick={handleConfirmOrder}
                    disabled={!state.checkoutData.termsAccepted || confirmLoading}
                    style={getButtonPrimaryGradientStyle(state.siteConfig)}
                    className="w-full py-4 rounded-xl text-white font-semibold shadow-lg shadow-black/30 hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {confirmLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Processando...
                      </>
                    ) : (
                      <>
                        <CheckCircle size={20} /> Confirmar Pedido
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          <CheckoutSidebar
            cartItems={cartItems}
            subtotal={subtotal}
            shipping={shipping}
            total={total}
            collapsed={summaryCollapsed}
            onToggle={() => setSummaryCollapsed(s => !s)}
          />
        </div>

        <div className="flex justify-between mt-8 pt-6 border-t border-white/10">
          <button onClick={state.checkoutStep === 1 ? () => dispatch({ type: "NAVIGATE", payload: "cart" }) : goBack} className="px-6 py-3 rounded-xl border border-white/10 text-zinc-400 font-medium hover:bg-white/5 transition-all">
            Voltar
          </button>
          {state.checkoutStep < 2 && <button onClick={goNext} disabled={!canProceed} style={getButtonSecondaryStyle(state.siteConfig)} className="px-6 py-3 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50 transition-all">Próximo</button>}
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ORDER SUCCESS PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function OrderSuccessPage() {
  const { state, dispatch } = useApp();
  const [copied, setCopied] = useState(false);
  const [qrError, setQrError] = useState(false);
  const data = state.orderSuccess;
  const qr = state.pixQrData;

  const copy = () => {
    if (!qr?.payload) return;
    navigator.clipboard?.writeText(qr.payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  if (!data) return null;
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden" style={getSiteBackgroundStyle(state.siteConfig)}>
      <div className="absolute inset-0 pointer-events-none confetti-bg" aria-hidden="true" />
      <div className="relative z-10 text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center mx-auto mb-6 animate-check-success">
          <CheckCircle size={40} className="text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Pedido realizado com sucesso! 🎉</h1>
        <p className="text-3xl font-bold text-violet-400 mb-4">{data.orderId}</p>
        <p className="text-zinc-400 text-sm mb-1">Total: {formatBRL(data.total)}</p>
        <p className="text-zinc-500 text-xs mb-6">Previsão de entrega: 5–8 dias úteis</p>

        <div className="mb-6 w-full rounded-2xl border border-emerald-500/20 bg-white/[0.02] p-6">
          <div className="flex items-center gap-2 mb-4 justify-center">
            <Zap size={18} className="text-emerald-400" />
            <h2 className="text-white font-semibold text-sm">Pague com PIX</h2>
          </div>

          {qr?.qrCodeUrl ? (
            <div className="flex flex-col items-center gap-4">
              {!qrError ? (
                <div className="rounded-xl overflow-hidden border-4 border-white p-1 bg-white shadow-lg shadow-emerald-500/10">
                  <img
                    src={qr.qrCodeUrl}
                    alt="QR Code PIX"
                    width={220}
                    height={220}
                    onError={() => setQrError(true)}
                    className="block"
                  />
                </div>
              ) : (
                <div className="w-[220px] h-[220px] rounded-xl border border-white/10 bg-white/5 flex flex-col items-center justify-center gap-2">
                  <AlertTriangle size={32} className="text-amber-400" />
                  <p className="text-zinc-400 text-xs px-4">
                    Não foi possível carregar o QR Code. Use o código PIX abaixo.
                  </p>
                </div>
              )}

              <div className="text-center w-full">
                <p className="text-zinc-500 text-xs mb-2">— ou copie o código PIX —</p>
                <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-left mb-2 max-h-24 overflow-y-auto">
                  <p className="text-zinc-300 text-xs font-mono break-all">
                    {qr.payload}
                  </p>
                </div>
                <button
                  onClick={copy}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 active:scale-95 transition-all"
                >
                  {copied ? <><CheckCircle size={16} /> Copiado!</> : <><Copy size={16} /> Copiar código PIX</>}
                </button>
              </div>

              <div className="text-center space-y-1">
                <p className="text-amber-400 text-xs flex items-center justify-center gap-1">
                  <span>⏱</span> Válido por 30 minutos
                </p>
                <p className="text-zinc-500 text-xs">
                  O pedido será confirmado assim que o pagamento for identificado.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
              <p className="text-zinc-400 text-sm">Gerando QR Code PIX...</p>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => { dispatch({ type: "CLEAR_CHECKOUT" }); dispatch({ type: "SET_PIX_QR_DATA", payload: null }); dispatch({ type: "NAVIGATE", payload: "orders" }); }}
            style={getButtonPrimaryGradientStyle(state.siteConfig)}
            className="px-6 py-3 rounded-xl text-white font-semibold transition-all hover:opacity-95"
          >
            Ver Meus Pedidos
          </button>
          <button
            onClick={() => { dispatch({ type: "CLEAR_CHECKOUT" }); dispatch({ type: "SET_PIX_QR_DATA", payload: null }); dispatch({ type: "NAVIGATE", payload: "home" }); }}
            className="px-6 py-3 rounded-xl border border-white/10 text-zinc-400 font-medium hover:bg-white/5 transition-all"
          >
            Continuar Comprando
          </button>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AuthPage() {
  const { state, dispatch } = useApp();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState(["", "", "", "", "", ""]);
  const [twoFactorError, setTwoFactorError] = useState(null);
  const [twoFactorContact, setTwoFactorContact] = useState("");
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [webAuthnPending, setWebAuthnPending] = useState(false);
  const [pendingToken, setPendingToken] = useState(null);
  const [webAuthnMode, setWebAuthnMode] = useState("registration");
  const [webAuthnLoading, setWebAuthnLoading] = useState(false);
  const [webAuthnError, setWebAuthnError] = useState(null);
  const codeInputsRef = useRef([]);

  const storeLogoImageUrl = state.siteConfig?.storeLogoImageUrl || "";
  const hasStoreLogoImage = Boolean(storeLogoImageUrl);

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: "" }));
  };

  const validateLogin = () => {
    const e = {};
    if (!form.email.trim()) e.email = "E-mail é obrigatório";
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = "E-mail inválido";
    if (!form.password) e.password = "Senha é obrigatória";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleLogin = async () => {
    if (!validateLogin()) return;
    setLoading(true);
    setErrors({});
    try {
      const data = await api("/auth/login", { method: "POST", body: { email: form.email.trim(), password: form.password, channel: "email" } }, dispatch);
      if (data.twoFactorRequired) {
        setTwoFactor(true);
        setTwoFactorContact(data.contact || "");
        setTwoFactorCode(["", "", "", "", "", ""]);
        setTwoFactorError(null);
        setTimeout(() => {
          codeInputsRef.current[0]?.focus();
        }, 0);
      } else if (data.webAuthnPending && data.pendingToken) {
        setWebAuthnPending(true);
        setPendingToken(data.pendingToken);
        setWebAuthnMode(data.webAuthnMode === "authentication" ? "authentication" : "registration");
        setWebAuthnError(null);
      } else if (data.token && data.user) {
        sessionStorage.setItem("novamart_token", data.token);
        dispatch({ type: "LOGIN", payload: data.user });
        dispatch({ type: "ADD_TOAST", payload: { type: "success", message: `Bem-vindo(a), ${data.user.name}! 👋` } });
      }
    } catch (err) {
      const msg =
        err.status === 403
          ? (err.message || "Acesso negado.")
          : err.message || "E-mail ou senha incorretos";
      setErrors({ general: msg });
      if (err.status !== 401 && err.status !== 403) {
        dispatch({ type: "ADD_TOAST", payload: { type: "error", message: msg } });
      }
    } finally {
      setLoading(false);
    }
  };

  const getWebAuthnPrerequisiteError = () => {
    if (typeof window === "undefined" || typeof window.PublicKeyCredential === "undefined") {
      return "Este navegador não suporta passkeys/WebAuthn. Use Chrome, Edge ou Safari atualizado.";
    }
    const h = window.location.hostname;
    const local = h === "localhost" || h === "127.0.0.1";
    if (!window.isSecureContext && !local) {
      return "Biometria exige HTTPS (ligação segura). Aceda com https:// no seu domínio ou configure certificado SSL no servidor. Em HTTP só funciona em localhost.";
    }
    return null;
  };

  const completeWebAuthn = async () => {
    if (!pendingToken) return;
    const preErr = getWebAuthnPrerequisiteError();
    if (preErr) {
      setWebAuthnError(preErr);
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: preErr } });
      return;
    }
    setWebAuthnLoading(true);
    setWebAuthnError(null);
    try {
      if (webAuthnMode === "registration") {
        const opts = await api("/auth/webauthn/register-options", { method: "POST", bearerToken: pendingToken }, dispatch);
        const att = await startRegistration({ optionsJSON: opts });
        const data = await api("/auth/webauthn/register-verify", { method: "POST", body: att, bearerToken: pendingToken }, dispatch);
        sessionStorage.setItem("novamart_token", data.token);
        dispatch({ type: "LOGIN", payload: data.user });
        dispatch({ type: "ADD_TOAST", payload: { type: "success", message: `Bem-vindo(a), ${data.user.name}! 👋` } });
      } else {
        const opts = await api("/auth/webauthn/login-options", { method: "POST", bearerToken: pendingToken }, dispatch);
        const asse = await startAuthentication({ optionsJSON: opts });
        const data = await api("/auth/webauthn/login-verify", { method: "POST", body: asse, bearerToken: pendingToken }, dispatch);
        sessionStorage.setItem("novamart_token", data.token);
        dispatch({ type: "LOGIN", payload: data.user });
        dispatch({ type: "ADD_TOAST", payload: { type: "success", message: `Bem-vindo(a), ${data.user.name}! 👋` } });
      }
      setWebAuthnPending(false);
      setPendingToken(null);
    } catch (err) {
      let msg = err.message || "Não foi possível concluir a verificação biométrica.";
      if (/not supported|secure context|insecure/i.test(msg)) {
        msg =
          "Biometria não está disponível nesta ligação. Use HTTPS no domínio público ou outro browser atualizado.";
      }
      setWebAuthnError(msg);
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: msg } });
    } finally {
      setWebAuthnLoading(false);
    }
  };

  const cancelWebAuthn = () => {
    setWebAuthnPending(false);
    setPendingToken(null);
    setWebAuthnError(null);
    setWebAuthnLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{
      ...getSiteBackgroundStyle(state.siteConfig),
    }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #7c3aed, transparent)" }} />
        <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full" style={{ background: "radial-gradient(circle, #6366f1, transparent)", opacity: 0.08 }} />
      </div>

      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <div className="flex flex-col items-center gap-2 mb-3">
            <div className="w-full max-w-[400px] aspect-[2/1] rounded-xl overflow-hidden bg-transparent flex items-center justify-center">
              {hasStoreLogoImage ? (
                <img src={storeLogoImageUrl} alt="Logo da loja" className="w-full h-full object-contain" />
              ) : (
                <Store size={64} className="text-white/90" />
              )}
            </div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-slate-200 to-white bg-clip-text text-transparent" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {state.siteConfig?.storeName || "NovaMart"}
            </h1>
          </div>
          <p className="text-zinc-500 text-sm tracking-wide">Sua loja favorita na internet</p>
        </div>

        <div className="rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
          <div className="flex border-b border-white/10">
            <button
              type="button"
              className="flex-1 flex items-center justify-center gap-2 py-4 text-sm font-semibold text-violet-400 border-b-2 border-violet-400 bg-violet-500/5"
            >
              <LogIn size={16} />
              Entrar
            </button>
          </div>

          <div className="p-6 space-y-4">
            {webAuthnPending ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3 text-center">
                  <Fingerprint className="mx-auto text-violet-400" size={40} strokeWidth={1.5} />
                  <p className="text-sm font-semibold text-zinc-100">
                    {webAuthnMode === "registration"
                      ? "Registe a biometria neste dispositivo"
                      : "Confirme a sua identidade"}
                  </p>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {webAuthnMode === "registration"
                      ? "É obrigatório no primeiro acesso. Apenas um dispositivo pode manter sessão ativa por vez."
                      : "Use o mesmo método (impressão digital, rosto ou chave de segurança) que já registou."}
                  </p>
                  {typeof window !== "undefined" &&
                    window.isSecureContext === false &&
                    window.location.hostname !== "localhost" &&
                    window.location.hostname !== "127.0.0.1" && (
                    <p className="text-xs text-amber-300/95 text-center leading-relaxed px-1">
                      Este site está em HTTP. Os browsers só permitem biometria com HTTPS (certificado SSL). Configure HTTPS no servidor (ex.: Let’s Encrypt + Nginx).
                    </p>
                  )}
                  {webAuthnError && (
                    <p className="text-xs text-rose-400">{webAuthnError}</p>
                  )}
                  <button
                    type="button"
                    onClick={completeWebAuthn}
                    disabled={webAuthnLoading}
                    style={getButtonPrimaryGradientStyle(state.siteConfig)}
                    className="w-full py-3 rounded-xl text-white font-semibold text-sm shadow-lg shadow-black/30 hover:opacity-95 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {webAuthnLoading ? (
                      <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> A aguardar o dispositivo...</>
                    ) : (
                      <><Fingerprint size={18} /> Continuar com biometria</>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={cancelWebAuthn}
                    disabled={webAuthnLoading}
                    className="w-full py-2 rounded-xl border border-white/10 text-zinc-300 text-xs"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            ) : (
            <>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (twoFactor) return;
                handleLogin();
              }}
            >
              {errors.general && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                  <span>⚠</span> {errors.general}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5 tracking-wide uppercase">E-mail</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    value={form.email}
                    onChange={e => set("email", e.target.value)}
                    disabled={twoFactor}
                    autoComplete="email"
                    className={`w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border text-white placeholder-zinc-600 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${
                      errors.email ? "border-rose-500/50" : "border-white/10 hover:border-white/20"
                    } ${twoFactor ? "opacity-60 cursor-not-allowed" : ""}`}
                  />
                </div>
                {errors.email && <p className="text-rose-400 text-xs mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5 tracking-wide uppercase">Senha</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={e => set("password", e.target.value)}
                    disabled={twoFactor}
                    autoComplete="current-password"
                    className={`w-full pl-10 pr-10 py-3 rounded-xl bg-white/5 border text-white placeholder-zinc-600 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${
                      errors.password ? "border-rose-500/50" : "border-white/10 hover:border-white/20"
                    } ${twoFactor ? "opacity-60 cursor-not-allowed" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p className="text-rose-400 text-xs mt-1">{errors.password}</p>}
              </div>

              <button
                type="submit"
                disabled={loading || twoFactor}
                style={getButtonPrimaryGradientStyle(state.siteConfig)}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm shadow-lg shadow-black/30 hover:opacity-95 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Entrar <ArrowRight size={16} /></>}
              </button>
            </form>

            {twoFactor && (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                <p className="text-sm text-emerald-300 font-medium flex items-center gap-2">
                  <Shield size={14} /> Verificação em duas etapas
                </p>
                <p className="text-xs text-zinc-400">
                  Enviamos um código de 6 dígitos para{" "}
                  <span className="font-semibold text-zinc-200">{twoFactorContact}</span> (e-mail).
                </p>
                <div className="flex justify-between gap-1" onPaste={e => {
                  const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                  if (!text) return;
                  const arr = text.split("");
                  const next = ["", "", "", "", "", ""].map((_, i) => arr[i] || "");
                  setTwoFactorCode(next);
                  const last = Math.min(arr.length - 1, 5);
                  codeInputsRef.current[last]?.focus();
                  e.preventDefault();
                }}>
                  {twoFactorCode.map((v, idx) => (
                    <input
                      key={idx}
                      ref={el => (codeInputsRef.current[idx] = el)}
                      value={v}
                      onChange={e => {
                        const d = e.target.value.replace(/\D/g, "").slice(0, 1);
                        const next = [...twoFactorCode];
                        next[idx] = d;
                        setTwoFactorCode(next);
                        if (d && idx < 5) codeInputsRef.current[idx + 1]?.focus();
                      }}
                      onKeyDown={e => {
                        if (e.key === "Backspace" && !twoFactorCode[idx] && idx > 0) {
                          codeInputsRef.current[idx - 1]?.focus();
                        }
                      }}
                      maxLength={1}
                      inputMode="numeric"
                      className="w-9 h-10 rounded-lg bg-white/5 border border-white/10 text-center text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    />
                  ))}
                </div>
                {twoFactorError && <p className="text-xs text-rose-400">{twoFactorError}</p>}
                <button
                  type="button"
                  disabled={twoFactorLoading || twoFactorCode.join("").length !== 6}
                  onClick={async () => {
                    if (twoFactorLoading) return;
                    setTwoFactorLoading(true);
                    setTwoFactorError(null);
                    try {
                      const data = await api("/auth/verify-2fa", {
                        method: "POST",
                        body: { email: form.email.trim(), code: twoFactorCode.join("") },
                      }, dispatch);
                      if (data.webAuthnPending && data.pendingToken) {
                        setWebAuthnPending(true);
                        setPendingToken(data.pendingToken);
                        setWebAuthnMode(data.webAuthnMode === "authentication" ? "authentication" : "registration");
                        setTwoFactor(false);
                        setWebAuthnError(null);
                      } else if (data.token && data.user) {
                        sessionStorage.setItem("novamart_token", data.token);
                        dispatch({ type: "LOGIN", payload: data.user });
                        dispatch({ type: "ADD_TOAST", payload: { type: "success", message: `Bem-vindo(a), ${data.user.name}! 👋` } });
                      }
                    } catch (err) {
                      setTwoFactorError(err.message || "Erro ao verificar código");
                    } finally {
                      setTwoFactorLoading(false);
                    }
                  }}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {twoFactorLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verificando...</> : <>Confirmar código</>}
                </button>
                <button
                  type="button"
                  onClick={() => { setTwoFactor(false); setTwoFactorCode(["", "", "", "", "", ""]); setTwoFactorError(null); }}
                  className="w-full py-2 rounded-xl border border-white/10 text-zinc-300 text-xs mt-1"
                  disabled={twoFactorLoading}
                >
                  Cancelar verificação
                </button>
              </div>
            )}
            </>
            )}
          </div>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">{state.siteConfig?.footerText || "© 2025 NovaMart — Todos os direitos reservados"}</p>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HEADER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

function Header() {
  const { state, dispatch } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(state.searchQuery);
  const menuRef = useRef(null);
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    if (!state.currentUser) return;
    if (state.storeIconLoaded) return;
    api("/settings/store", {}, dispatch)
      .then(data => dispatch({ type: "SET_STORE_ICON", payload: data?.icon || "Store" }))
      .catch(() => {});
  }, [state.currentUser?.id, state.storeIconLoaded, dispatch]);

  useEffect(() => {
    if (!state.currentUser) return;
    if (state.siteConfigLoaded) return;
    api("/settings/site", {}, dispatch)
      .then(data => dispatch({ type: "SET_SITE_CONFIG", payload: data || {} }))
      .catch(() => {});
  }, [state.currentUser?.id, state.siteConfigLoaded, dispatch]);

  useEffect(() => {
    dispatch({ type: "SET_SEARCH", payload: debouncedSearch });
  }, [debouncedSearch, dispatch]);

  useEffect(() => {
    setSearchInput(state.searchQuery);
  }, [state.searchQuery]);

  const cartCount = state.cart.reduce((sum, i) => sum + i.quantity, 0);
  const isAdmin = state.currentUser?.role === "admin";
  const isCustomer = state.currentUser && state.currentUser.role === "customer";

  const storeIconMap = {
    Store,
    Home,
    ShoppingCart,
    Package,
  };
  const storeIcon = state.storeIcon || "Store";
  const StoreIconComp = storeIconMap[storeIcon] || Store;

  const themePrimary = state.siteConfig?.primaryColor || "#8b5cf6";
  const themeSecondary = state.siteConfig?.secondaryColor || "#6366f1";
  const storeLogoImageUrl = state.siteConfig?.storeLogoImageUrl || "";
  const hasStoreLogoImage = Boolean(storeLogoImageUrl);
  const storeName = state.siteConfig?.storeName || "NovaMart";

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const nav = (page) => {
    dispatch({ type: "NAVIGATE", payload: page });
    setMenuOpen(false);
    setMobileMenuOpen(false);
  };

  const openCartDrawer = () => dispatch({ type: "TOGGLE_CART_DRAWER", payload: true });

  return (
    <header className="sticky top-0 z-40 transition-all duration-300 border-b border-white/[0.06]"
      style={{ background: "rgba(10, 10, 20, 0.85)", backdropFilter: "blur(20px)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-start justify-between min-h-[100px] py-2">
          <button
            onClick={() => nav("home")}
            className={`group ${hasStoreLogoImage ? "flex flex-col items-center" : "flex items-center gap-2"}`}
          >
            <div
              className="rounded-lg flex items-center justify-center shadow-md transition-shadow overflow-hidden w-[200px] h-[100px]"
              style={{
                background: hasStoreLogoImage
                  ? "transparent"
                  : `linear-gradient(135deg, ${themePrimary}, ${themeSecondary})`,
              }}
            >
              {hasStoreLogoImage ? (
                <img
                  src={storeLogoImageUrl}
                  alt="Logo da loja"
                  className="w-full h-full object-contain"
                />
              ) : (
                <StoreIconComp size={56} className="text-white/95" />
              )}
            </div>
            {!hasStoreLogoImage && (
              <span className="text-lg font-bold text-white tracking-tight hidden sm:block" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {storeName}
              </span>
            )}
          </button>

          <div className="hidden md:flex flex-1 max-w-md mx-8 mt-2">
            <div className="relative w-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="text" placeholder="Buscar produtos..." value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-10 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/30 transition-all"
                aria-label="Buscar produtos" />
              {searchInput && (
                <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-1 rounded" aria-label="Limpar busca">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 mt-2">
            {state.currentUser?.role !== "admin" && (
              <button onClick={openCartDrawer} className="relative p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-all" aria-label="Abrir carrinho">
                <ShoppingCart size={20} />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-violet-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-lg shadow-violet-500/30 animate-pop">
                    {cartCount}
                  </span>
                )}
              </button>
            )}

            {isCustomer && (
              <button
                onClick={() => dispatch({ type: "SET_CHAT_OPEN", payload: !state.chatOpen })}
                className="relative p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
                aria-label="Atendimento"
              >
                <MessageCircle size={20} />
                {state.chatUnreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-rose-500/40 animate-pop">
                    {state.chatUnreadCount}
                  </span>
                )}
              </button>
            )}

            <div className="relative hidden sm:block" ref={menuRef}>
              <button onClick={() => setMenuOpen(m => !m)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/5 transition-all">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 flex items-center justify-center text-violet-400 text-xs font-bold">
                  {state.currentUser?.name?.[0]?.toUpperCase() || "?"}
                </div>
                <span className="text-sm font-medium max-w-[100px] truncate">{state.currentUser?.name || "Usuário"}</span>
                <ChevronDown size={14} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/10 shadow-xl py-1 overflow-hidden animate-fade-down"
                  style={{ background: "rgba(20, 20, 35, 0.95)", backdropFilter: "blur(20px)" }}>
                  <div className="px-4 py-3 border-b border-white/10">
                    <p className="text-sm font-medium text-white">{state.currentUser?.name}</p>
                    <p className="text-xs text-zinc-500">{state.currentUser?.email || "Modo visitante"}</p>
                  </div>
                  {state.currentUser?.role !== "guest" && (
                    <>
                      <button onClick={() => nav("profile")} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors">
                        <User size={15} /> Meu Perfil
                      </button>
                    <button onClick={() => nav("orders")} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors">
                      <Package size={15} /> Meus Pedidos
                    </button>
                    </>
                  )}
                  {isAdmin && (
                    <button onClick={() => nav("admin-dashboard")} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-violet-400 hover:bg-violet-500/10 transition-colors">
                      <Shield size={15} /> Painel Admin
                    </button>
                  )}
                  <div className="border-t border-white/10 mt-1">
                    <button onClick={() => { sessionStorage.removeItem("novamart_token"); dispatch({ type: "LOGOUT" }); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors">
                      <LogOut size={15} /> Sair
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => setMobileMenuOpen(m => !m)} className="sm:hidden p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-all">
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        <div className="md:hidden pb-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="text" placeholder="Buscar produtos..." value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-10 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all" />
            {searchInput && (
              <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-1 rounded" aria-label="Limpar busca">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="sm:hidden pb-4 border-t border-white/10 pt-3 space-y-1 animate-fade-down">
            <button onClick={() => nav("home")} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-white/5">
              {hasStoreLogoImage ? (
                <img src={storeLogoImageUrl} alt="Logo da loja" className="w-4 h-4 object-contain" />
              ) : (
                <StoreIconComp size={16} />
              )}
              Loja
            </button>
            {state.currentUser?.role !== "guest" && (
              <>
                <button onClick={() => nav("profile")} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-white/5"><User size={16} /> Meu Perfil</button>
                <button onClick={() => nav("orders")} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-white/5"><Package size={16} /> Meus Pedidos</button>
              </>
            )}
            {isAdmin && (
              <button onClick={() => nav("admin-dashboard")} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-violet-400 hover:bg-violet-500/10"><Shield size={16} /> Painel Admin</button>
            )}
            <button onClick={() => { sessionStorage.removeItem("novamart_token"); dispatch({ type: "LOGOUT" }); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-rose-400 hover:bg-rose-500/10"><LogOut size={16} /> Sair</button>
          </div>
        )}
      </div>
    </header>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HOME PAGE (Catálogo + Filtros + Grid/Lista)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SORT_OPTIONS = [
  { value: "default", label: "Relevância" },
  { value: "price_asc", label: "Menor preço" },
  { value: "price_desc", label: "Maior preço" },
  { value: "name_asc", label: "Nome A → Z" },
  { value: "name_desc", label: "Nome Z → A" },
  { value: "newest", label: "Mais recentes" },
];

function highlightMatch(text, query) {
  if (!query || !text) return text;
  const q = query.trim().toLowerCase();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-violet-500/40 text-violet-200 rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function useFilteredAndSortedProducts(products, searchQuery, filters) {
  const q = searchQuery.trim().toLowerCase();
  let list = products.filter(p => p.active);

  if (q) {
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  }
  if (filters.categories.length > 0) {
    list = list.filter(p => filters.categories.includes(p.category));
  }
  if (filters.priceMin != null && filters.priceMin !== "") {
    const min = Number(filters.priceMin);
    if (!Number.isNaN(min)) list = list.filter(p => p.price >= min);
  }
  if (filters.priceMax != null && filters.priceMax !== "") {
    const max = Number(filters.priceMax);
    if (!Number.isNaN(max)) list = list.filter(p => p.price <= max);
  }

  const sorted = [...list];
  switch (filters.sortBy) {
    case "price_asc": sorted.sort((a, b) => a.price - b.price); break;
    case "price_desc": sorted.sort((a, b) => b.price - a.price); break;
    case "name_asc": sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
    case "name_desc": sorted.sort((a, b) => b.name.localeCompare(a.name)); break;
    case "newest": sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)); break;
    default: break;
  }
  return sorted;
}

function HomePage() {
  const { state, dispatch } = useApp();
  const themePrimary = state.siteConfig?.primaryColor || "#8b5cf6";
  const themeSecondary = state.siteConfig?.secondaryColor || "#6366f1";
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceMinInput, setPriceMinInput] = useState("");
  const [priceMaxInput, setPriceMaxInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const catalogRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "SET_LOADING", payload: true });
    api("/products", {}, dispatch)
      .then(data => {
        if (!cancelled && data.products) dispatch({ type: "SET_PRODUCTS", payload: data.products });
      })
      .catch(err => {
        if (!cancelled) dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao carregar produtos" } });
      })
      .finally(() => {
        if (!cancelled) dispatch({ type: "SET_LOADING", payload: false });
      });
    return () => { cancelled = true; };
  }, [dispatch]);

  const allFiltered = useFilteredAndSortedProducts(state.products, state.searchQuery, state.filters);
  const totalProducts = state.products.filter(p => p.active).length;
  const productsLoading = state.loading;

  useEffect(() => {
    setPriceMinInput(state.filters.priceMin != null && state.filters.priceMin !== "" ? String(state.filters.priceMin) : "");
    setPriceMaxInput(state.filters.priceMax != null && state.filters.priceMax !== "" ? String(state.filters.priceMax) : "");
  }, [state.filters.priceMin, state.filters.priceMax]);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleCategory = (cat) => {
    const next = state.filters.categories.includes(cat)
      ? state.filters.categories.filter(c => c !== cat)
      : [...state.filters.categories, cat];
    dispatch({ type: "SET_FILTERS", payload: { categories: next } });
  };

  const applyPriceFilter = () => {
    const min = priceMinInput === "" ? null : parseFloat(priceMinInput);
    const max = priceMaxInput === "" ? null : parseFloat(priceMaxInput);
    if (min != null && max != null && !Number.isNaN(min) && !Number.isNaN(max) && min > max) return;
    dispatch({ type: "SET_FILTERS", payload: { priceMin: min ?? null, priceMax: max ?? null } });
  };

  const clearPriceFilter = () => {
    setPriceMinInput("");
    setPriceMaxInput("");
    dispatch({ type: "SET_FILTERS", payload: { priceMin: null, priceMax: null } });
  };

  const removePriceTag = () => {
    setPriceMinInput("");
    setPriceMaxInput("");
    dispatch({ type: "SET_FILTERS", payload: { priceMin: null, priceMax: null } });
  };

  const hasActiveFilters = state.filters.categories.length > 0 ||
    (state.filters.priceMin != null && state.filters.priceMin !== "") ||
    (state.filters.priceMax != null && state.filters.priceMax !== "") ||
    state.filters.sortBy !== "default";

  const removeFilterTag = (type, value) => {
    if (type === "category") dispatch({ type: "SET_FILTERS", payload: { categories: state.filters.categories.filter(c => c !== value) } });
    if (type === "price") removePriceTag();
  };

  const resetAllFilters = () => {
    dispatch({ type: "RESET_FILTERS" });
    setPriceMinInput("");
    setPriceMaxInput("");
  };

  const scrollToCatalog = () => {
    catalogRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const hasSearchOrFilters = state.searchQuery.trim() || state.filters.categories.length > 0 ||
    (state.filters.priceMin != null && state.filters.priceMin !== "") ||
    (state.filters.priceMax != null && state.filters.priceMax !== "") ||
    state.filters.sortBy !== "default";
  const prevFiltersRef = useRef(state.filters);
  const prevSearchRef = useRef(state.searchQuery);
  useEffect(() => {
    const filtersChanged = prevFiltersRef.current !== state.filters;
    const searchChanged = prevSearchRef.current !== state.searchQuery;
    prevFiltersRef.current = state.filters;
    prevSearchRef.current = state.searchQuery;
    if (!hasSearchOrFilters) return;
    if (!filtersChanged && !searchChanged) return;
    setLoading(true);
    const t = setTimeout(() => {
      setLoading(false);
      catalogRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 300);
    return () => clearTimeout(t);
  }, [state.filters, state.searchQuery]);

  const showSkeleton = productsLoading || (loading && hasSearchOrFilters);

  const addToCart = (eOrProduct, productMaybe) => {
    const e = productMaybe !== undefined ? eOrProduct : undefined;
    const product = productMaybe !== undefined ? productMaybe : eOrProduct;
    e?.stopPropagation?.();
    if (state.currentUser?.role === "guest") {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Faça login para adicionar ao carrinho" } });
      return;
    }
    if (!product || product.stock === 0) return;
    dispatch({ type: "ADD_TO_CART", payload: { productId: product.id } });
    dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Adicionado ao carrinho!", productName: product.name, productEmoji: product.image } });
  };

  const productIdsByNewest = [...state.products].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).map(p => p.id);
  const newestIds = new Set(productIdsByNewest.slice(0, 2));

  const displayList = loading ? [] : allFiltered;

  return (
    <div className="min-h-screen pb-20" style={getSiteBackgroundStyle(state.siteConfig)}>
      <div
        className="relative overflow-hidden rounded-2xl mx-4 sm:mx-6 mt-6 p-8 sm:p-12 border"
        style={{
          borderColor: hexToRgba(themePrimary, 0.15),
          background: `linear-gradient(135deg, ${hexToRgba(themePrimary, 0.15)}, ${hexToRgba(themeSecondary, 0.1)}, ${hexToRgba(themeSecondary, 0.06)})`,
        }}
      >
        <div
          className="absolute -top-20 -right-20 w-60 h-60 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${hexToRgba(themePrimary, 0.2)}, transparent)` }}
        />
        {state.siteConfig?.bannerImageUrl && (
          <img
            src={state.siteConfig.bannerImageUrl}
            alt="Banner do site"
            className="absolute inset-0 w-full h-full object-cover opacity-20"
          />
        )}
        {state.siteConfig?.bannerImageUrl && (
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/25 to-transparent" />
        )}
        <div className="relative">
          <span className="inline-block px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/20 text-violet-300 text-xs font-semibold mb-4 tracking-wider uppercase">✨ Novidades</span>
          {(state.siteConfig?.heroTitle || "").trim() && (
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
              <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">{state.siteConfig?.heroTitle}</span>
            </h2>
          )}
          {(state.siteConfig?.heroDescription || "").trim() && (
            <p className="text-zinc-400 text-sm sm:text-base max-w-lg">{state.siteConfig?.heroDescription}</p>
          )}
        </div>
      </div>

      {/* Pills de categoria (toggle) */}
      <div ref={catalogRef} className="flex gap-2 px-4 sm:px-6 mt-6 overflow-x-auto pb-2">
        <button
          onClick={() => dispatch({ type: "SET_FILTERS", payload: { categories: [] } })}
          className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${state.filters.categories.length === 0 ? "bg-violet-500/15 border border-violet-500/25 text-violet-300" : "bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"}`}
        >
          Todos
        </button>
        {CATEGORIES.map(cat => {
          const count = state.products.filter(p => p.active && p.category === cat).length;
          const active = state.filters.categories.includes(cat);
          return (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${active ? "bg-violet-500/15 border border-violet-500/25 text-violet-300" : "bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"}`}
            >
              {cat} <span className="text-xs opacity-75">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Barra de filtros desktop + botão mobile */}
      <div className="px-4 sm:px-6 mt-4 flex flex-wrap items-center gap-3">
        <div className="hidden md:flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <Filter size={14} className="text-zinc-500" />
            <span className="text-xs text-zinc-400">Preço:</span>
            <input type="number" placeholder="Mín" value={priceMinInput} onChange={e => setPriceMinInput(e.target.value)}
              className="w-20 bg-transparent border-none text-white text-sm placeholder-zinc-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
            <span className="text-zinc-600">–</span>
            <input type="number" placeholder="Máx" value={priceMaxInput} onChange={e => setPriceMaxInput(e.target.value)}
              className="w-20 bg-transparent border-none text-white text-sm placeholder-zinc-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
            <button onClick={applyPriceFilter} className="text-violet-400 text-xs font-medium hover:text-violet-300">Aplicar</button>
            <button onClick={clearPriceFilter} className="text-zinc-500 text-xs hover:text-zinc-300">Limpar</button>
          </div>
          <select
            value={state.filters.sortBy}
            onChange={e => dispatch({ type: "SET_FILTERS", payload: { sortBy: e.target.value } })}
            className="rounded-xl border border-white/10 bg-white/5 text-white text-sm py-2 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value} className="bg-zinc-900 text-white">{opt.label}</option>
            ))}
          </select>
        </div>
        <button onClick={() => setFiltersOpen(true)} className="md:hidden flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-zinc-300 text-sm">
          <Filter size={16} /> Filtros
        </button>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-zinc-500 text-sm">Visualização:</span>
          <button onClick={() => dispatch({ type: "SET_VIEW_MODE", payload: "grid" })} className={`p-2 rounded-lg transition-colors ${state.viewMode === "grid" ? "bg-violet-500/20 text-violet-400" : "text-zinc-500 hover:text-zinc-300"}`} aria-label="Grade">
            <LayoutGrid size={18} />
          </button>
          <button onClick={() => dispatch({ type: "SET_VIEW_MODE", payload: "list" })} className={`p-2 rounded-lg transition-colors ${state.viewMode === "list" ? "bg-violet-500/20 text-violet-400" : "text-zinc-500 hover:text-zinc-300"}`} aria-label="Lista">
            <List size={18} />
          </button>
        </div>
      </div>

      {/* Drawer filtros mobile */}
      {filtersOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 md:hidden animate-overlay-in" onClick={() => setFiltersOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-zinc-900 border-r border-white/10 shadow-2xl p-4 overflow-y-auto md:hidden animate-drawer-in">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Filtros</h3>
              <button onClick={() => setFiltersOpen(false)} className="p-2 rounded-lg text-zinc-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-zinc-500 uppercase mb-2">Categoria</p>
                {CATEGORIES.map(cat => {
                  const count = state.products.filter(p => p.active && p.category === cat).length;
                  const checked = state.filters.categories.includes(cat);
                  return (
                    <label key={cat} className="flex items-center gap-2 py-1.5 cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => toggleCategory(cat)} className="rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500/50" />
                      <span className="text-sm text-zinc-300">{cat}</span>
                      <span className="text-xs text-zinc-500">({count})</span>
                    </label>
                  );
                })}
              </div>
              <div>
                <p className="text-xs text-zinc-500 uppercase mb-2">Faixa de preço</p>
                <div className="flex gap-2">
                  <input type="number" placeholder="Mín (R$)" value={priceMinInput} onChange={e => setPriceMinInput(e.target.value)} className="flex-1 rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
                  <input type="number" placeholder="Máx (R$)" value={priceMaxInput} onChange={e => setPriceMaxInput(e.target.value)} className="flex-1 rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => { applyPriceFilter(); setFiltersOpen(false); }}
                    style={getButtonPrimaryGradientStyle(state.siteConfig)}
                    className="flex-1 py-2 rounded-lg text-white text-sm font-medium hover:opacity-95 transition-all"
                  >
                    Aplicar
                  </button>
                  <button onClick={clearPriceFilter} className="py-2 px-3 rounded-lg border border-white/10 text-zinc-400 text-sm">Limpar</button>
                </div>
              </div>
              <div>
                <p className="text-xs text-zinc-500 uppercase mb-2">Ordenação</p>
                <select value={state.filters.sortBy} onChange={e => dispatch({ type: "SET_FILTERS", payload: { sortBy: e.target.value } })} className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-violet-500/30">
                  {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value} className="bg-zinc-900">{opt.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Barra de filtros ativos + contagem */}
      {(hasActiveFilters || displayList.length !== totalProducts) && (
        <div className="px-4 sm:px-6 mt-3 flex flex-wrap items-center gap-2">
          {state.filters.categories.map(cat => (
            <span key={cat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-500/15 border border-violet-500/25 text-violet-300 text-xs">
              {cat} <button onClick={() => removeFilterTag("category", cat)} className="hover:text-white" aria-label="Remover">✕</button>
            </span>
          ))}
          {((state.filters.priceMin != null && state.filters.priceMin !== "") || (state.filters.priceMax != null && state.filters.priceMax !== "")) && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-500/15 border border-violet-500/25 text-violet-300 text-xs">
              {state.filters.priceMin != null && state.filters.priceMin !== "" ? formatBRL(Number(state.filters.priceMin)) : "—"} – {state.filters.priceMax != null && state.filters.priceMax !== "" ? formatBRL(Number(state.filters.priceMax)) : "—"}
              <button onClick={removePriceTag} className="hover:text-white" aria-label="Remover">✕</button>
            </span>
          )}
          {state.filters.sortBy !== "default" && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 text-zinc-400 text-xs">
              {SORT_OPTIONS.find(o => o.value === state.filters.sortBy)?.label}
            </span>
          )}
          {hasActiveFilters && (
            <button onClick={resetAllFilters} className="text-rose-400 hover:text-rose-300 text-xs font-medium flex items-center gap-1">
              <Trash2 size={12} /> Limpar todos os filtros
            </button>
          )}
          <span className="text-zinc-500 text-sm ml-auto">Exibindo {displayList.length} de {totalProducts} produtos</span>
        </div>
      )}

      {/* Grid ou Lista */}
      <div className="px-4 sm:px-6 mt-4">
        {showSkeleton ? (
          <div className={state.viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" : "space-y-3"}>
            {[...Array(8)].map((_, i) => (
              <div key={i} className={`rounded-2xl border border-white/[0.08] overflow-hidden ${state.viewMode === "list" ? "flex gap-4 p-4" : ""}`} style={{ animationDelay: `${i * 40}ms` }}>
                <div className={`bg-zinc-800/50 animate-skeleton ${state.viewMode === "grid" ? "h-48" : "w-24 h-24 shrink-0 rounded-xl"}`} />
                <div className="p-4 flex-1">
                  <div className="h-4 bg-zinc-800/50 rounded animate-skeleton w-3/4 mb-2" />
                  <div className="h-3 bg-zinc-800/50 rounded animate-skeleton w-full mb-2" />
                  <div className="h-3 bg-zinc-800/50 rounded animate-skeleton w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : displayList.length === 0 ? (
          <div className="text-center py-20">
            <span className="text-6xl block mb-4">🔍</span>
            <h3 className="text-xl font-semibold text-white mb-2">Nenhum produto encontrado</h3>
            <p className="text-zinc-500 text-sm mb-6">Tente ajustar os filtros ou o termo de busca.</p>
            <button
              onClick={resetAllFilters}
              style={getButtonPrimaryGradientStyle(state.siteConfig)}
              className="px-6 py-3 rounded-xl text-white font-medium text-sm transition-all shadow-lg shadow-black/30 hover:opacity-95"
            >
              Limpar filtros
            </button>
          </div>
        ) : state.viewMode === "list" ? (
          <ul className="space-y-3">
            {displayList.map((product, idx) => (
              <li key={product.id} className="flex items-center gap-4 p-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:border-white/15 transition-all animate-stagger-in" style={{ animationDelay: `${idx * 50}ms` }}>
                <div className="cursor-pointer shrink-0" onClick={() => dispatch({ type: "SET_SELECTED_PRODUCT", payload: product.id })}><ProductImage product={product} size="sm" className="!w-24 !h-24 rounded-xl" /></div>
                <div className="flex-1 min-w-0">
                  <button onClick={() => dispatch({ type: "SET_SELECTED_PRODUCT", payload: product.id })} className="text-white font-semibold text-sm hover:text-violet-300 truncate block text-left">{highlightMatch(product.name, state.searchQuery)}</button>
                  <p className="text-zinc-500 text-xs line-clamp-1">{product.description}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded bg-white/10 text-zinc-400 text-xs">{product.category}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    {product.originalPrice && <span className="text-zinc-500 line-through text-xs block">{formatBRL(product.originalPrice)}</span>}
                    <span className="text-lg font-bold text-white">{formatBRL(product.price)}</span>
                  </div>
                  <button type="button" onClick={() => dispatch({ type: "SET_SELECTED_PRODUCT", payload: product.id })} className="p-2 rounded-lg border border-white/10 text-zinc-400 hover:text-violet-400 hover:border-violet-500/30 text-sm">Ver Detalhes</button>
                  <button
                    type="button"
                    onClick={(e) => addToCart(e, product)}
                    disabled={product.stock === 0}
                    style={getButtonPrimaryGradientStyle(state.siteConfig)}
                    className="p-2.5 rounded-xl text-white disabled:opacity-50 transition-all hover:opacity-95"
                  >
                    <ShoppingCart size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayList.map((product, idx) => (
              <div key={product.id} className="group rounded-2xl border border-white/[0.08] overflow-hidden transition-all duration-300 hover:border-white/15 hover:shadow-xl hover:shadow-violet-500/5 hover:-translate-y-1 animate-stagger-in" style={{ background: "rgba(255,255,255,0.03)", animationDelay: `${idx * 50}ms` }}>
                <div className="relative h-48 cursor-pointer overflow-hidden" onClick={() => dispatch({ type: "SET_SELECTED_PRODUCT", payload: product.id })}>
                  <div className="absolute inset-0"><ProductImage product={product} size="md" className="w-full h-full rounded-none group-hover:scale-110 transition-transform duration-500" /></div>
                  {product.stock === 0 && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="px-3 py-1 rounded-full bg-rose-500/90 text-white text-sm font-bold">Esgotado</span>
                    </div>
                  )}
                  {product.stock > 0 && product.stock < 5 && (
                    <span className="absolute top-3 right-3 px-2 py-1 rounded-full bg-amber-500/90 text-white text-xs font-bold shadow-lg">Últimas {product.stock}!</span>
                  )}
                  {product.originalPrice && <span className="absolute top-3 right-3 px-2 py-1 rounded-full bg-rose-500/90 text-white text-xs font-bold shadow-lg">Promoção</span>}
                  {newestIds.has(product.id) && !product.originalPrice && product.stock > 0 && <span className="absolute top-3 right-3 px-2 py-1 rounded-full bg-emerald-500/90 text-white text-xs font-bold shadow-lg">Novo</span>}
                  <span className="absolute top-3 left-3 px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white text-xs font-medium border border-white/10">{product.category}</span>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-4">
                    <p className="text-zinc-300 text-xs line-clamp-2 mb-2">{product.description}</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={e => { e.stopPropagation(); dispatch({ type: "SET_SELECTED_PRODUCT", payload: product.id }); }} className="flex-1 py-2 rounded-lg bg-white/20 text-white text-xs font-medium hover:bg-white/30 transition-colors">Ver Detalhes</button>
                      <button
                        type="button"
                        onClick={e => addToCart(e, product)}
                        disabled={product.stock === 0}
                        style={getButtonPrimaryGradientStyle(state.siteConfig)}
                        className="p-2 rounded-lg text-white disabled:opacity-50 transition-colors hover:opacity-95"
                      >
                        <ShoppingCart size={14} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <button onClick={() => dispatch({ type: "SET_SELECTED_PRODUCT", payload: product.id })} className="text-white font-semibold text-sm mb-1 truncate block w-full text-left hover:text-violet-300">
                    {highlightMatch(product.name, state.searchQuery)}
                  </button>
                  <p className="text-zinc-500 text-xs mb-3 line-clamp-2">{product.description}</p>
                  <div className="flex items-center justify-between">
                    <div>
                      {product.originalPrice && <span className="text-zinc-500 line-through text-xs block">{formatBRL(product.originalPrice)}</span>}
                      <span className="text-lg font-bold text-white">{formatBRL(product.price)}</span>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => dispatch({ type: "SET_SELECTED_PRODUCT", payload: product.id })} className="p-2 rounded-lg border border-white/10 text-zinc-400 hover:text-violet-400 hover:border-violet-500/30" aria-label="Ver detalhes"><Eye size={14} /></button>
                      <button
                        type="button"
                        onClick={(e) => addToCart(e, product)}
                        disabled={product.stock === 0}
                        style={getButtonPrimaryGradientStyle(state.siteConfig)}
                        className="p-2.5 rounded-xl text-white shadow-lg shadow-black/30 active:scale-95 disabled:opacity-50 transition-all hover:opacity-95"
                        aria-label="Adicionar ao carrinho"
                      >
                        <ShoppingCart size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showBackToTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={getButtonPrimaryGradientStyle(state.siteConfig)}
          className="fixed bottom-6 right-6 z-30 p-3 rounded-full text-white shadow-lg shadow-black/30 hover:opacity-95 transition-all focus:outline-none focus:ring-2 focus:ring-white/20"
          aria-label="Voltar ao topo"
        >
          <ChevronUp size={20} />
        </button>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CART PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CartPage() {
  const { state, dispatch } = useApp();

  const cartItems = state.cart.map(item => {
    const product = state.products.find(p => p.id === item.productId);
    return { ...item, product };
  }).filter(i => i.product);

  const subtotal = cartItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const shipping = 15;
  const total = subtotal + shipping;

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={getSiteBackgroundStyle(state.siteConfig)}>
        <div className="text-center">
          <span className="text-6xl block mb-4">🛒</span>
          <h2 className="text-xl font-bold text-white mb-2">Seu carrinho está vazio</h2>
          <p className="text-zinc-500 text-sm mb-6">Adicione produtos para começar suas compras</p>
          <button onClick={() => dispatch({ type: "NAVIGATE", payload: "home" })}
            style={getButtonPrimaryGradientStyle(state.siteConfig)}
            className="px-6 py-3 rounded-xl text-white font-medium text-sm transition-all shadow-lg shadow-black/30 hover:opacity-95">
            Explorar produtos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6" style={getSiteBackgroundStyle(state.siteConfig)}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6" style={{ fontFamily: "'Outfit', sans-serif" }}>
          Carrinho <span className="text-zinc-500 text-lg font-normal">({cartItems.length} {cartItems.length === 1 ? "item" : "itens"})</span>
        </h1>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {cartItems.map(({ product, quantity }) => (
              <div key={product.id} className="flex items-center gap-4 p-4 rounded-xl border border-white/[0.08]" style={{ background: "rgba(255,255,255,0.03)" }}>
                <ProductImage product={product} size="sm" className="!w-16 !h-16 rounded-xl shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-white text-sm font-medium truncate">{product.name}</h3>
                  <p className="text-zinc-500 text-xs">{formatBRL(product.price)} un.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => dispatch({ type: "UPDATE_CART_QTY", payload: { productId: product.id, quantity: quantity - 1 } })}
                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 flex items-center justify-center text-sm font-bold transition-all">−</button>
                  <span className="text-white text-sm font-medium w-6 text-center">{quantity}</span>
                  <button onClick={() => dispatch({ type: "UPDATE_CART_QTY", payload: { productId: product.id, quantity: quantity + 1 } })}
                    disabled={quantity >= product.stock}
                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 flex items-center justify-center text-sm font-bold transition-all disabled:opacity-30">+</button>
                </div>
                <span className="text-white font-semibold text-sm w-24 text-right">{formatBRL(product.price * quantity)}</span>
                <button onClick={() => dispatch({ type: "REMOVE_FROM_CART", payload: product.id })}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"><X size={16} /></button>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-white/[0.08] p-5 h-fit" style={{ background: "rgba(255,255,255,0.03)" }}>
            <h3 className="text-white font-semibold mb-4">Resumo</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-zinc-400"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
              <div className="flex justify-between text-zinc-400">
                <span>Frete</span>
                <span className="font-medium">{formatBRL(shipping)}</span>
              </div>
              <div className="border-t border-white/10 pt-3 mt-3">
                <div className="flex justify-between text-white font-bold text-base"><span>Total</span><span>{formatBRL(total)}</span></div>
              </div>
            </div>
            <button onClick={() => dispatch({ type: "NAVIGATE", payload: "checkout" })}
              style={getButtonPrimaryGradientStyle(state.siteConfig)}
              className="w-full mt-5 py-3 rounded-xl text-white font-semibold text-sm shadow-lg shadow-black/30 hover:opacity-95 transition-all flex items-center justify-center gap-2">
              Finalizar Pedido <ArrowRight size={16} />
            </button>
            <button onClick={() => dispatch({ type: "NAVIGATE", payload: "home" })}
              className="w-full mt-2 py-3 rounded-xl border border-white/10 text-zinc-400 font-medium text-sm hover:bg-white/5 transition-all">
              Continuar comprando
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ORDERS PAGE (Aprimorada)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ORDER_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendentes" },
  { value: "in_progress", label: "Em andamento" },
  { value: "delivered", label: "Entregues" },
  { value: "cancelled", label: "Cancelados" },
];

function mapApiOrderToState(o) {
  return {
    id: o.id,
    userId: o.user_id ?? o.userId,
    items: (o.items || []).map(it => ({ productId: it.productId, name: it.productName ?? it.name, quantity: it.quantity, price: it.unitPrice ?? it.price })),
    total: o.total,
    status: o.status,
    paymentMethod: o.payment_method ?? o.paymentMethod,
    address: typeof o.address === "string" ? (() => { try { return JSON.parse(o.address || "{}"); } catch { return {}; } })() : (o.address || {}),
    createdAt: o.created_at ?? o.createdAt,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHAT WIDGET (CLIENTE)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ChatWidget() {
  const { state, dispatch } = useApp();
  const [view, setView] = useState("list"); // list | detail | new
  const [activeConversation, setActiveConversation] = useState(null);
  const messagesEndRef = useRef(null);

  const isCustomer = state.currentUser && state.currentUser.role === "customer";
  const chatOpen = state.chatOpen && isCustomer;

  useEffect(() => {
    let interval;
    if (isCustomer) {
      const fetchUnread = () => {
        api("/chat/unread-count", {}, dispatch)
          .then(data => dispatch({ type: "SET_CHAT_UNREAD", payload: data.unread ?? 0 }))
          .catch(() => {});
      };
      fetchUnread();
      interval = setInterval(fetchUnread, 10000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isCustomer, dispatch]);

  useEffect(() => {
    if (!chatOpen) return;
    let cancelled = false;
    dispatch({ type: "SET_CHAT_LOADING", payload: true });
    api("/chat/conversations", {}, dispatch)
      .then(data => {
        if (!cancelled) dispatch({ type: "SET_CHAT_CONVERSATIONS", payload: data.conversations || [] });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Erro ao carregar conversas" } });
      })
      .finally(() => {
        if (!cancelled) dispatch({ type: "SET_CHAT_LOADING", payload: false });
      });
    return () => { cancelled = true; };
  }, [chatOpen, dispatch]);

  const loadConversation = (id, opts = { markRead: true }) => {
    dispatch({ type: "SET_CHAT_LOADING", payload: true });
    api(`/chat/conversations/${id}`, {}, dispatch)
      .then(data => {
        dispatch({ type: "SET_ACTIVE_CHAT", payload: id });
        dispatch({ type: "SET_CHAT_MESSAGES", payload: data.messages || [] });
        setActiveConversation(data.conversation || null);
        setView("detail");
        if (opts.markRead) {
          api(`/chat/conversations/${id}/read`, { method: "PATCH" }, dispatch).catch(() => {});
        }
      })
      .catch(err => {
        dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao abrir conversa" } });
      })
      .finally(() => {
        dispatch({ type: "SET_CHAT_LOADING", payload: false });
      });
  };

  useEffect(() => {
    if (!chatOpen || !state.activeChatId) return;
    const id = state.activeChatId;
    let cancelled = false;
    const poll = () => {
      api(`/chat/conversations/${id}`, {}, dispatch)
        .then(data => {
          if (!cancelled) {
            dispatch({ type: "SET_CHAT_MESSAGES", payload: data.messages || [] });
            setActiveConversation(data.conversation || null);
          }
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [chatOpen, state.activeChatId, dispatch]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [state.chatMessages.length, chatOpen]);

  const handleSendMessage = async () => {
    const content = state.newChatMessage.trim();
    if (!content || !state.activeChatId) return;
    try {
      const data = await api(`/chat/conversations/${state.activeChatId}/messages`, { method: "POST", body: { content } }, dispatch);
      dispatch({ type: "ADD_CHAT_MESSAGE", payload: data.message });
      dispatch({ type: "SET_NEW_CHAT_MESSAGE", payload: "" });
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao enviar mensagem" } });
    }
  };

  const handleCreateConversation = async () => {
    const subject = state.newChatSubject.trim();
    const firstMessage = state.newChatMessage.trim();
    if (!subject || !firstMessage) {
      dispatch({ type: "ADD_TOAST", payload: { type: "warning", message: "Preencha assunto e mensagem" } });
      return;
    }
    try {
      dispatch({ type: "SET_CHAT_LOADING", payload: true });
      const data = await api("/chat/conversations", { method: "POST", body: { subject, content: firstMessage } }, dispatch);
      const conv = data.conversation;
      dispatch({ type: "SET_CHAT_CONVERSATIONS", payload: [conv, ...(state.chatConversations || [])] });
      dispatch({ type: "SET_NEW_CHAT_SUBJECT", payload: "" });
      dispatch({ type: "SET_NEW_CHAT_MESSAGE", payload: "" });
      loadConversation(conv.id, { markRead: true });
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao iniciar conversa" } });
    } finally {
      dispatch({ type: "SET_CHAT_LOADING", payload: false });
    }
  };

  if (!chatOpen) return null;

  const isMobile = window.innerWidth < 640;
  const containerClasses = isMobile
    ? "fixed inset-x-0 bottom-0 z-40 h-[70vh] sm:h-[500px]"
    : "fixed bottom-4 right-4 z-40 w-[340px] h-[480px]";

  const sortedConversations = [...(state.chatConversations || [])].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

  const unreadForConversation = (conv) => {
    return conv.unread_count ?? 0;
  };

  const renderMessageBubble = (m) => {
    const isMine = m.sender_id === state.currentUser?.id;
    const name = m.sender_name || (m.sender_role === "admin" ? "Atendente" : "Você");
    const time = new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return (
      <div key={m.id} className={`flex mb-2 ${isMine ? "justify-end" : "justify-start"}`}>
        <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs shadow-sm ${isMine ? "bg-violet-600 text-white rounded-br-sm" : "bg-zinc-800 text-zinc-100 rounded-bl-sm"}`}>
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className={`font-semibold ${isMine ? "text-white/90" : "text-zinc-200"}`}>{name}</span>
            <span className={`${isMine ? "text-violet-100/80" : "text-zinc-400"}`}>{time}</span>
          </div>
          <p className="whitespace-pre-wrap break-words">{m.content}</p>
        </div>
      </div>
    );
  };

  const headerTitle = view === "new" ? "Nova Conversa" : view === "detail" ? (activeConversation?.subject || "Atendimento") : "Atendimento";

  return (
    <div className={containerClasses}>
      <div className="absolute inset-0 rounded-t-2xl sm:rounded-2xl border border-white/10 shadow-xl overflow-hidden"
        style={{ background: "linear-gradient(160deg, rgba(15,23,42,0.98) 0%, rgba(9,9,11,0.98) 100%)" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white">
              <MessageCircle size={16} />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">{headerTitle}</p>
              <p className="text-[10px] text-zinc-400">Tempo médio de resposta em minutos</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {view !== "list" && (
              <button
                onClick={() => { setView("list"); dispatch({ type: "SET_ACTIVE_CHAT", payload: null }); }}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5"
                aria-label="Voltar para lista"
              >
                <ArrowRight size={16} className="rotate-180" />
              </button>
            )}
            <button
              onClick={() => dispatch({ type: "SET_CHAT_OPEN", payload: false })}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5"
              aria-label="Fechar chat"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex flex-col h-[calc(100%-48px)]">
          {view === "list" && (
            <div className="flex-1 flex flex-col">
              <div className="p-3 border-b border-white/5 flex items-center justify-between gap-2">
                <p className="text-[11px] text-zinc-400">
                  Precisa de ajuda com um pedido, pagamento ou produto?
                </p>
                <button
                  onClick={() => { setView("new"); dispatch({ type: "SET_NEW_CHAT_SUBJECT", payload: "" }); dispatch({ type: "SET_NEW_CHAT_MESSAGE", payload: "" }); }}
                  className="px-2 py-1 rounded-lg bg-violet-600 text-white text-[11px] font-medium hover:bg-violet-500"
                >
                  Nova
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
                {state.chatLoading && (
                  <div className="flex justify-center py-6">
                    <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />
                  </div>
                )}
                {!state.chatLoading && sortedConversations.length === 0 && (
                  <div className="text-center text-xs text-zinc-500 py-8 px-4">
                    Você ainda não abriu nenhuma conversa. Clique em <span className="text-violet-300 font-medium">Nova</span> para falar com a gente.
                  </div>
                )}
                {!state.chatLoading && sortedConversations.map(conv => {
                  const unread = unreadForConversation(conv);
                  const lastMessage = conv.last_message || "";
                  const updated = conv.updated_at ? new Date(conv.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
                  const isClosed = conv.status === "closed";
                  return (
                    <button
                      key={conv.id}
                      onClick={() => loadConversation(conv.id, { markRead: true })}
                      className={`w-full text-left rounded-xl px-3 py-2.5 border transition-colors flex items-start gap-2 ${
                        isClosed ? "opacity-70" : ""
                      } ${
                        state.activeChatId === conv.id
                          ? "border-violet-500/40 bg-violet-500/10"
                          : "border-white/8 bg-white/0 hover:bg-white/5"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-xs text-violet-300 font-semibold">
                        {(conv.customer_name || "Você").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className="text-xs font-semibold text-white truncate">
                            {conv.subject || "Atendimento"}
                          </p>
                          <span className="text-[10px] text-zinc-400">{updated}</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {lastMessage || "Sem mensagens ainda"}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                            isClosed ? "bg-zinc-700 text-zinc-300" : "bg-emerald-500/15 text-emerald-300"
                          }`}>
                            {isClosed ? "Encerrada" : "Aberta"}
                          </span>
                          {unread > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-semibold">
                              {unread} nova{unread > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {view === "new" && (
            <div className="flex-1 flex flex-col">
              <div className="p-3 border-b border-white/5">
                <p className="text-xs text-zinc-300 mb-1">Conte pra gente como podemos ajudar</p>
                <p className="text-[11px] text-zinc-500">
                  Assunto e primeira mensagem ajudam nosso time a entender mais rápido o seu caso.
                </p>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Assunto</label>
                  <input
                    type="text"
                    value={state.newChatSubject}
                    onChange={e => dispatch({ type: "SET_NEW_CHAT_SUBJECT", payload: e.target.value })}
                    placeholder="Ex: Dúvida sobre meu pedido"
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Mensagem</label>
                  <textarea
                    value={state.newChatMessage}
                    onChange={e => dispatch({ type: "SET_NEW_CHAT_MESSAGE", payload: e.target.value })}
                    placeholder="Descreva sua dúvida ou problema com detalhes :)"
                    rows={5}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
                  />
                </div>
              </div>
              <div className="p-3 border-t border-white/5 flex items-center gap-2">
                <button
                  onClick={() => setView("list")}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-[11px] text-zinc-300 hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateConversation}
                  disabled={state.chatLoading}
                  style={getButtonPrimaryGradientStyle(state.siteConfig)}
                  className="flex-1 px-3 py-2 rounded-lg text-xs text-white font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60 hover:opacity-95"
                >
                  {state.chatLoading && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  Iniciar conversa
                </button>
              </div>
            </div>
          )}

          {view === "detail" && (
            <div className="flex-1 flex flex-col">
              <div className="flex-1 overflow-y-auto px-3 py-3">
                {activeConversation?.status === "closed" && (
                  <div className="mb-3 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-300 flex items-center gap-2">
                    <XCircle size={14} className="text-rose-400" />
                    <span>Esta conversa foi encerrada. Você pode abrir uma nova se precisar de mais ajuda.</span>
                  </div>
                )}
                {state.chatMessages.length === 0 && (
                  <div className="h-full flex items-center justify-center text-[11px] text-zinc-500">
                    Nenhuma mensagem ainda. Envie a primeira!
                  </div>
                )}
                {state.chatMessages.map(renderMessageBubble)}
                <div ref={messagesEndRef} />
              </div>
              <div className="p-3 border-t border-white/5">
                <div className={`flex items-end gap-2 rounded-xl px-2.5 py-2 ${activeConversation?.status === "closed" ? "bg-zinc-900/80 border border-zinc-800" : "bg-zinc-900/60 border border-white/10"}`}>
                  <textarea
                    value={state.newChatMessage}
                    onChange={e => dispatch({ type: "SET_NEW_CHAT_MESSAGE", payload: e.target.value })}
                    placeholder={activeConversation?.status === "closed" ? "Conversa encerrada" : "Digite sua mensagem..."}
                    rows={2}
                    disabled={activeConversation?.status === "closed"}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (activeConversation?.status !== "closed") handleSendMessage();
                      }
                    }}
                    className="flex-1 bg-transparent border-none outline-none text-xs text-white placeholder-zinc-500 resize-none"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={activeConversation?.status === "closed" || !state.newChatMessage.trim()}
                    style={getButtonPrimaryGradientStyle(state.siteConfig)}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-95"
                    aria-label="Enviar mensagem"
                  >
                    <ArrowRight size={16} className="rotate-180" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OrdersPage() {
  const { state, dispatch } = useApp();
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [cancelModal, setCancelModal] = useState(null);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    if (state.currentUser?.role === "guest") return;
    let cancelled = false;
    setOrdersLoading(true);
    api("/orders", {}, dispatch)
      .then(data => {
        if (!cancelled && data.orders) dispatch({ type: "SET_ORDERS", payload: data.orders.map(mapApiOrderToState) });
      })
      .catch(() => { if (!cancelled) dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Erro ao carregar pedidos" } }); })
      .finally(() => { if (!cancelled) setOrdersLoading(false); });
    return () => { cancelled = true; };
  }, [state.currentUser?.id, dispatch]);

  const userOrders = state.orders.filter(o => o.userId === state.currentUser?.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const filtered = state.ordersFilter === "all" ? userOrders : state.ordersFilter === "in_progress" ? userOrders.filter(o => ["confirmed", "shipped"].includes(o.status)) : userOrders.filter(o => o.status === state.ordersFilter);

  const countByFilter = (value) => {
    if (value === "all") return userOrders.length;
    if (value === "in_progress") return userOrders.filter(o => ["confirmed", "shipped"].includes(o.status)).length;
    return userOrders.filter(o => o.status === value).length;
  };

  const getProductEmoji = (productId) => state.products.find(p => p.id === productId)?.image || "📦";

  const handleCancelOrder = async (orderIdOrOrder) => {
    const orderId = typeof orderIdOrOrder === "object" ? orderIdOrOrder?.id : orderIdOrOrder;
    if (!orderId) return;
    try {
      await api(`/orders/${orderId}/cancel`, { method: "PATCH" }, dispatch);
      const data = await api("/orders", {}, dispatch);
      if (data.orders) dispatch({ type: "SET_ORDERS", payload: data.orders.map(mapApiOrderToState) });
      api("/products", {}, dispatch).then(d => d.products && dispatch({ type: "SET_PRODUCTS", payload: d.products })).catch(() => {});
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Pedido cancelado." } });
      setCancelModal(null);
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao cancelar pedido" } });
    }
  };

  const handleReorder = (order) => {
    dispatch({ type: "REORDER", payload: order.id });
    const added = order.items.filter(i => state.products.find(p => p.id === i.productId)?.stock > 0).length;
    const skipped = order.items.length - added;
    if (skipped > 0) dispatch({ type: "ADD_TOAST", payload: { type: "warning", message: `${added} itens adicionados. ${skipped} sem estoque.` } });
    else dispatch({ type: "ADD_TOAST", payload: { type: "success", message: `${added} itens adicionados ao carrinho!` } });
  };

  const statusTimeline = ["pending", "confirmed", "shipped", "delivered"];

  if (ordersLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={getSiteBackgroundStyle(state.siteConfig)}>
        <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (userOrders.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={getSiteBackgroundStyle(state.siteConfig)}>
        <div className="text-center">
          <span className="text-6xl block mb-4">📦</span>
          <h2 className="text-xl font-bold text-white mb-2">Você ainda não fez nenhum pedido</h2>
          <p className="text-zinc-500 text-sm mb-6">Faça seu primeiro pedido agora!</p>
          <button onClick={() => dispatch({ type: "NAVIGATE", payload: "home" })}
            className="px-6 py-3 rounded-xl bg-violet-600 text-white font-medium text-sm hover:bg-violet-500 transition-all shadow-lg shadow-violet-500/20">
            Ir para a loja
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6" style={getSiteBackgroundStyle(state.siteConfig)}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6" style={{ fontFamily: "'Outfit', sans-serif" }}>Meus Pedidos</h1>
        <div className="flex gap-2 flex-wrap mb-6">
          {ORDER_FILTERS.map(({ value, label }) => (
            <button key={value} onClick={() => dispatch({ type: "SET_ORDERS_FILTER", payload: value })} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${state.ordersFilter === value ? "bg-violet-500/20 border border-violet-500/30 text-violet-300" : "border border-white/10 text-zinc-400 hover:bg-white/5"}`}>
              {label} ({countByFilter(value)})
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-500">Nenhum pedido com status selecionado.</p>
            <button onClick={() => dispatch({ type: "SET_ORDERS_FILTER", payload: "all" })} className="mt-3 text-violet-400 text-sm hover:underline">Ver todos</button>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(order => {
              const statusCfg = STATUS_CONFIG[order.status];
              const expanded = expandedOrder === order.id;
              const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
              const previewEmojis = order.items.slice(0, 3).map(i => getProductEmoji(i.productId));
              return (
                <div key={order.id} className="rounded-2xl border border-white/[0.08] overflow-hidden transition-all hover:border-white/12 hover:shadow-lg hover:shadow-violet-500/5" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <button onClick={() => setExpandedOrder(expanded ? null : order.id)} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-1">
                        {previewEmojis.map((emoji, i) => <span key={i} className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-sm">{emoji}</span>)}
                      </div>
                      <div>
                        <p className="text-white font-semibold">{order.id}</p>
                        <p className="text-zinc-500 text-xs">{formatDate(order.createdAt)} · {itemCount} {itemCount === 1 ? "item" : "itens"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${statusCfg.color}`}>{statusCfg.label}</span>
                      <span className="text-white font-semibold">{formatBRL(order.total)}</span>
                      <ChevronDown size={18} className={`text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  {expanded && (
                    <div className="border-t border-white/[0.08] p-4 space-y-4 animate-fade-down">
                      <div className="space-y-0">
                        {statusTimeline.map((st, i) => {
                          const idx = statusTimeline.indexOf(order.status);
                          const isDone = order.status === "cancelled" ? st === "pending" : idx > i;
                          const isCurrent = order.status !== "cancelled" && order.status === st;
                          const isCancelledStep = order.status === "cancelled" && st === "pending";
                          return (
                            <div key={st} className="flex items-center gap-3">
                              <div className="flex flex-col items-center">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 ${isDone ? "bg-emerald-500/20 text-emerald-400" : isCurrent ? "bg-violet-500/20 text-violet-400 animate-pulse" : isCancelledStep ? "bg-rose-500/20 text-rose-400" : "bg-zinc-700 text-zinc-500"}`}>
                                  {isDone ? <CheckCircle size={12} /> : isCancelledStep ? <XCircle size={12} /> : i + 1}
                                </div>
                                {i < statusTimeline.length - 1 && <div className={`w-0.5 flex-1 min-h-[12px] ${isDone ? "bg-emerald-500/30" : "bg-zinc-700"}`} />}
                              </div>
                              <span className={`text-sm ${isCurrent ? "text-violet-300 font-medium" : "text-zinc-400"}`}>{STATUS_CONFIG[st]?.label || st}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500 uppercase mb-2">Itens</p>
                        {order.items.map((item, idx) => {
                          const prod = state.products.find(p => p.id === item.productId);
                          return (
                            <div key={idx} className="flex justify-between py-1.5 text-sm items-center gap-2">
                              <span className="text-zinc-300 flex items-center gap-2 min-w-0">
                                {prod ? <ProductImage product={prod} size="sm" className="!w-6 !h-6 rounded shrink-0" /> : <span>{getProductEmoji(item.productId)}</span>}
                                {item.quantity}x {item.name}
                              </span>
                              <span className="text-zinc-400 shrink-0">{formatBRL(item.price * item.quantity)}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="pt-2 border-t border-white/5">
                        <p className="text-xs text-zinc-500 uppercase mb-1">Endereço</p>
                        <p className="text-zinc-300 text-sm">{order.address.street}, {order.address.number}{order.address.complement ? ` — ${order.address.complement}` : ""} — {order.address.neighborhood || ""}, {order.address.city}/{order.address.state}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500 uppercase mb-1">Pagamento</p>
                        <p className="text-zinc-300 text-sm">{order.paymentMethod === "credit_card" ? "Cartão de Crédito" : order.paymentMethod === "pix" ? "PIX" : "Boleto"} — {formatBRL(order.total)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2">
                        {order.status === "pending" && (
                          <button onClick={() => setCancelModal(order.id)} className="px-4 py-2 rounded-xl border border-rose-500/30 text-rose-400 text-sm font-medium hover:bg-rose-500/10 transition-all">
                            Cancelar Pedido
                          </button>
                        )}
                        <button onClick={() => handleReorder(order)} className="px-4 py-2 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-300 text-sm font-medium hover:bg-violet-500/20 transition-all">
                          Comprar Novamente
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {cancelModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 animate-overlay-in" onClick={() => setCancelModal(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="rounded-2xl border border-white/10 bg-zinc-900 p-6 max-w-sm w-full shadow-xl animate-modal-in">
              <h3 className="text-lg font-semibold text-white mb-2">Cancelar pedido?</h3>
              <p className="text-zinc-400 text-sm mb-6">Tem certeza? Esta ação não pode ser desfeita.</p>
              <div className="flex gap-3">
                <button onClick={() => setCancelModal(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-zinc-300 font-medium hover:bg-white/5">Não</button>
                <button onClick={() => handleCancelOrder(cancelModal)} className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-500">Sim, cancelar</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROFILE PAGE & SUBCOMPONENTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AvatarUpload() {
  const { state, dispatch } = useApp();
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);

  const avatar = state.profileData?.avatar;
  const name = state.profileData?.name || state.currentUser?.name || "";

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Formato inválido. Use JPEG, PNG ou WebP." } });
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Tamanho máximo de 3MB." } });
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    const url = URL.createObjectURL(file);
    setPreview(url);
    upload(file);
  };

  const upload = async (file) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const token = sessionStorage.getItem("novamart_token");
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Erro ao enviar avatar");
      }
      dispatch({ type: "UPDATE_PROFILE_FIELD", payload: { avatar: data.avatar } });
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Foto de perfil atualizada!" } });
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao enviar avatar" } });
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    try {
      const data = await api("/profile/avatar", { method: "DELETE" }, dispatch);
      dispatch({ type: "UPDATE_PROFILE_FIELD", payload: { avatar: data.avatar } });
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Foto removida." } });
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao remover avatar" } });
    }
  };

  const displaySrc = preview || avatar || null;
  const initials = name?.charAt(0)?.toUpperCase() || "?";

  return (
    <div className="space-y-3">
      <div className="relative w-24 h-24 mx-auto">
        <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-violet-500/30 bg-zinc-900 flex items-center justify-center text-3xl text-violet-300">
          {displaySrc ? (
            <img src={displaySrc} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="absolute inset-0 rounded-full bg-black/50 opacity-0 hover:opacity-100 flex flex-col items-center justify-center text-xs text-zinc-100 transition-opacity"
          aria-label="Alterar foto de perfil"
        >
          <ImagePlus size={18} />
          <span className="mt-1">Alterar</span>
        </button>
        {uploading && (
          <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-violet-400/40 border-t-violet-400 rounded-full animate-spin" />
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
      {state.profileData?.avatar && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleRemove}
            className="text-xs text-rose-300 hover:text-rose-200 hover:underline"
          >
            Remover foto
          </button>
        </div>
      )}
    </div>
  );
}

function PhoneVerificationFlow() {
  const { state, dispatch } = useApp();
  const inputsRef = useRef([]);

  useEffect(() => {
    if (state.smsStep === "code") {
      inputsRef.current[0]?.focus();
    }
  }, [state.smsStep]);

  useEffect(() => {
    if (state.smsCountdown <= 0) return;
    const timer = setInterval(() => {
      dispatch({ type: "SET_SMS_COUNTDOWN", payload: state.smsCountdown - 1 });
    }, 1000);
    return () => clearInterval(timer);
  }, [state.smsCountdown, dispatch]);

  const startSend = async () => {
    const digits = state.smsPendingPhone.replace(/\D/g, "");
    if (!digits || digits.length < 10) {
      dispatch({ type: "SET_SMS_ERROR", payload: "Telefone inválido (mín. 10 dígitos)" });
      return;
    }
    try {
      dispatch({ type: "SET_SMS_STEP", payload: "sending" });
      dispatch({ type: "SET_SMS_ERROR", payload: null });
      const data = await api("/profile/phone/send-code", {
        method: "POST",
        body: { phone: state.smsPendingPhone },
      }, dispatch);
      dispatch({ type: "SET_SMS_STEP", payload: "code" });
      dispatch({ type: "SET_SMS_COUNTDOWN", payload: 60 });
      dispatch({ type: "SET_SMS_CODE", payload: ["", "", "", "", "", ""] });
      dispatch({ type: "SET_SMS_MOCK_CODE", payload: null });
    } catch (err) {
      dispatch({ type: "SET_SMS_STEP", payload: "input" });
      dispatch({ type: "SET_SMS_ERROR", payload: err.message || "Erro ao enviar o código por e-mail" });
    }
  };

  const handleCodeChange = (index, value) => {
    const v = value.replace(/\D/g, "").slice(0, 1);
    const next = [...state.smsCode];
    next[index] = v;
    dispatch({ type: "SET_SMS_CODE", payload: next });
    if (v && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !state.smsCode[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    const arr = text.split("");
    const next = ["", "", "", "", "", ""].map((_, i) => arr[i] || "");
    dispatch({ type: "SET_SMS_CODE", payload: next });
    const lastIndex = Math.min(text.length - 1, 5);
    inputsRef.current[lastIndex]?.focus();
    e.preventDefault();
  };

  const verify = async () => {
    const code = state.smsCode.join("");
    if (code.length !== 6) return;
    try {
      dispatch({ type: "SET_SMS_ERROR", payload: null });
      const data = await api("/profile/phone/verify", {
        method: "POST",
        body: { phone: state.smsPendingPhone, code },
      }, dispatch);
      if (data.user) {
        dispatch({ type: "SET_PROFILE_DATA", payload: data.user });
      }
      dispatch({ type: "SET_SMS_STEP", payload: "verified" });
      setTimeout(() => {
        dispatch({ type: "SET_SMS_STEP", payload: "input" });
        dispatch({ type: "SET_SMS_PENDING_PHONE", payload: "" });
        dispatch({ type: "SET_SMS_CODE", payload: ["", "", "", "", "", ""] });
      }, 2000);
    } catch (err) {
      dispatch({ type: "SET_SMS_ERROR", payload: err.message || "Erro ao verificar código" });
    }
  };

  if (state.smsStep === "input" || state.smsStep === "sending") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-300 font-medium">Alterar telefone</p>
        <p className="text-xs text-zinc-500">
          Enviaremos um código de 6 dígitos para o seu e-mail cadastrado para confirmar o novo número.
        </p>
        <div className="space-y-1">
          <label className="block text-xs text-zinc-500 mb-1">Novo número</label>
          <div className="relative max-w-xs">
            <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={state.smsPendingPhone}
              onChange={e => dispatch({ type: "SET_SMS_PENDING_PHONE", payload: formatPhone(e.target.value) })}
              placeholder="(11) 99999-9999"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>
        </div>
        {state.smsError && <p className="text-xs text-rose-400">{state.smsError}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "SET_SMS_STEP", payload: "input" });
              dispatch({ type: "SET_SMS_PENDING_PHONE", payload: "" });
              dispatch({ type: "SET_SMS_ERROR", payload: null });
            }}
            className="px-3 py-2 rounded-lg border border-white/10 text-xs text-zinc-300 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={startSend}
            disabled={state.smsStep === "sending"}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-xs text-white font-semibold flex items-center gap-2 disabled:opacity-60"
          >
            {state.smsStep === "sending" && (
              <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            Enviar código por e-mail
          </button>
        </div>
      </div>
    );
  }

  if (state.smsStep === "code") {
    const countdown = state.smsCountdown;
    const canResend = countdown <= 0;
    const codeFilled = state.smsCode.join("").length === 6;
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm text-zinc-300 font-medium">Digite o código recebido</p>
          <p className="text-xs text-zinc-500">
            Verifique sua caixa de entrada (e spam). O código foi enviado para o e-mail da sua conta.
          </p>
        </div>
        <div className="flex justify-between gap-1" onPaste={handlePaste}>
          {state.smsCode.map((val, idx) => (
            <input
              key={idx}
              ref={el => (inputsRef.current[idx] = el)}
              value={val}
              onChange={e => handleCodeChange(idx, e.target.value)}
              onKeyDown={e => handleKeyDown(idx, e)}
              maxLength={1}
              inputMode="numeric"
              className="w-9 h-10 rounded-lg bg-white/5 border border-white/10 text-center text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          ))}
        </div>
        {state.smsError && <p className="text-xs text-rose-400">{state.smsError}</p>}
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          {!canResend ? (
            <span>Reenviar em {countdown}s</span>
          ) : (
            <button
              type="button"
              onClick={startSend}
              className="text-violet-300 hover:text-violet-200 hover:underline"
            >
              Reenviar código
            </button>
          )}
        </div>
        <div className="flex justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "SET_SMS_STEP", payload: "input" });
              dispatch({ type: "SET_SMS_CODE", payload: ["", "", "", "", "", ""] });
              dispatch({ type: "SET_SMS_ERROR", payload: null });
            }}
            className="px-3 py-2 rounded-lg border border-white/10 text-xs text-zinc-300 hover:bg-white/5"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={verify}
            disabled={!codeFilled}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-xs text-white font-semibold disabled:opacity-50"
          >
            Verificar
          </button>
        </div>
      </div>
    );
  }

  if (state.smsStep === "verified") {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-2">
        <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center animate-bounce">
          <CheckCircle size={20} className="text-emerald-400" />
        </div>
        <p className="text-sm text-emerald-300 font-medium">Telefone verificado com sucesso!</p>
        <p className="text-xs text-zinc-500">{state.profileData?.phone}</p>
      </div>
    );
  }

  return null;
}

function AddressSection() {
  const { state, dispatch } = useApp();
  const profileAddress = state.profileData?.default_address
    ? (typeof state.profileData.default_address === "string"
      ? (() => { try { return JSON.parse(state.profileData.default_address); } catch { return {}; } })()
      : state.profileData.default_address)
    : {};
  const [form, setForm] = useState({
    zip: profileAddress.zip || "",
    street: profileAddress.street || "",
    number: profileAddress.number || "",
    complement: profileAddress.complement || "",
    neighborhood: profileAddress.neighborhood || "",
    city: profileAddress.city || "",
    state: profileAddress.state || "",
  });
  const [errors, setErrors] = useState({});
  const saveAddress = (state.profileData?.save_address ?? 1) === 1;

  useEffect(() => {
    const addr = profileAddress;
    setForm({
      zip: addr.zip || "",
      street: addr.street || "",
      number: addr.number || "",
      complement: addr.complement || "",
      neighborhood: addr.neighborhood || "",
      city: addr.city || "",
      state: addr.state || "",
    });
  }, [state.profileData?.default_address]);

  const validate = () => {
    if (!saveAddress) {
      setErrors({});
      return true;
    }
    const e = {};
    const zip = form.zip.replace(/\D/g, "");
    if (!zip || zip.length !== 8) e.zip = "CEP inválido (8 dígitos)";
    if (!form.street.trim()) e.street = "Obrigatório";
    if (!form.number.trim()) e.number = "Obrigatório";
    if (!form.neighborhood.trim()) e.neighborhood = "Obrigatório";
    if (!form.city.trim()) e.city = "Obrigatório";
    if (!form.state) e.state = "Selecione o estado";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      const body = {
        save_address: saveAddress ? 1 : 0,
        default_address: saveAddress ? form : null,
      };
      const data = await api("/profile/me", { method: "PUT", body }, dispatch);
      if (data.user) {
        dispatch({ type: "SET_PROFILE_DATA", payload: data.user });
      }
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Endereço salvo!" } });
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao salvar endereço" } });
    }
  };

  const toggleSave = async () => {
    const next = !saveAddress;
    try {
      const body = {
        save_address: next ? 1 : 0,
        default_address: next ? form : null,
      };
      const data = await api("/profile/me", { method: "PUT", body }, dispatch);
      if (data.user) {
        dispatch({ type: "SET_PROFILE_DATA", payload: data.user });
      }
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao atualizar preferência" } });
    }
  };

  const disabled = !saveAddress;
  const wrapDisabled = disabled ? "opacity-50 pointer-events-none" : "";

  const handleCepSearch = async () => {
    const digits = form.zip.replace(/\D/g, "");
    if (digits.length !== 8) {
      setErrors({ zip: "CEP inválido (8 dígitos)" });
      return;
    }

    setErrors({});
    try {
      const cepData = await api(`/cep/${digits}`, {}, dispatch);
      setForm(f => ({
        ...f,
        zip: cepData?.zip || maskCEP(digits),
        street: cepData?.street || "",
        neighborhood: cepData?.neighborhood || "",
        city: cepData?.city || "",
        state: cepData?.state || "",
      }));
    } catch (err) {
      const msg = err?.message || "Não foi possível buscar o CEP.";
      setErrors({ zip: msg.includes("não encontrado") ? "CEP não encontrado" : msg });
    }
  };

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl border border-white/10 hover:bg-white/5 transition-colors">
        <input
          type="checkbox"
          checked={saveAddress}
          onChange={toggleSave}
          className="mt-1 w-5 h-5 rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500/40"
        />
        <div>
          <p className="text-white text-sm font-medium">Salvar meu endereço</p>
          <p className="text-zinc-500 text-xs">
            {saveAddress
              ? "Seu endereço será pré-preenchido no checkout."
              : "Endereço não será salvo — você precisará preencher a cada compra."}
          </p>
        </div>
      </label>

      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${wrapDisabled}`}>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">CEP</label>
          <div className="relative max-w-xs">
            <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={form.zip}
              onChange={e => setForm(f => ({ ...f, zip: maskCEP(e.target.value) }))}
              placeholder="00000-000"
              className={`w-full pl-10 pr-12 py-2.5 rounded-xl bg-white/5 border text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${errors.zip ? "border-rose-500/50" : "border-white/10"}`}
            />
            <button
              type="button"
              onClick={handleCepSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50"
            >
              <Search size={14} />
            </button>
          </div>
          {errors.zip && <p className="text-rose-400 text-xs mt-1">{errors.zip}</p>}
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Número</label>
          <div className="relative max-w-[140px]">
            <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={form.number}
              onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
              className={`w-full pl-10 pr-3 py-2.5 rounded-xl bg-white/5 border text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${errors.number ? "border-rose-500/50" : "border-white/10"}`}
            />
          </div>
          {errors.number && <p className="text-rose-400 text-xs mt-1">{errors.number}</p>}
        </div>
      </div>

      <div className={`space-y-4 ${wrapDisabled}`}>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Rua / Logradouro</label>
          <div className="relative">
            <Home size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={form.street}
              onChange={e => setForm(f => ({ ...f, street: e.target.value }))}
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${errors.street ? "border-rose-500/50" : "border-white/10"}`}
            />
          </div>
          {errors.street && <p className="text-rose-400 text-xs mt-1">{errors.street}</p>}
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Complemento</label>
          <input
            value={form.complement}
            onChange={e => setForm(f => ({ ...f, complement: e.target.value }))}
            placeholder="Apto, bloco, referência..."
            className="w-full pl-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Bairro</label>
            <div className="relative">
              <Building size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={form.neighborhood}
                onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))}
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${errors.neighborhood ? "border-rose-500/50" : "border-white/10"}`}
              />
            </div>
            {errors.neighborhood && <p className="text-rose-400 text-xs mt-1">{errors.neighborhood}</p>}
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Cidade</label>
            <div className="relative">
              <Map size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${errors.city ? "border-rose-500/50" : "border-white/10"}`}
              />
            </div>
            {errors.city && <p className="text-rose-400 text-xs mt-1">{errors.city}</p>}
          </div>
        </div>
        <div className="max-w-[160px]">
          <label className="block text-xs text-zinc-500 mb-1">Estado</label>
          <select
            value={form.state}
            onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
            className={`w-full py-2.5 rounded-xl bg-white/5 border text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${errors.state ? "border-rose-500/50" : "border-white/10"}`}
          >
            <option value="">UF</option>
            {BR_STATES.map(uf => (
              <option key={uf} value={uf} className="bg-zinc-900">
                {uf}
              </option>
            ))}
          </select>
          {errors.state && <p className="text-rose-400 text-xs mt-1">{errors.state}</p>}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-xs text-white font-semibold shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 disabled:opacity-50"
        >
          Salvar Endereço
        </button>
      </div>
    </div>
  );
}

function ProfilePage() {
  const { state, dispatch } = useApp();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(state.currentUser?.name || "");
  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showPwdFields, setShowPwdFields] = useState(false);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "SET_PROFILE_LOADING", payload: true });
    api("/profile/me", {}, dispatch)
      .then(data => {
        if (!cancelled && data.user) {
          dispatch({ type: "SET_PROFILE_DATA", payload: data.user });
          setNameValue(data.user.name || "");
        }
      })
      .catch(err => {
        if (!cancelled) {
          dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao carregar perfil" } });
        }
      })
      .finally(() => {
        if (!cancelled) dispatch({ type: "SET_PROFILE_LOADING", payload: false });
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  if (!state.currentUser || state.currentUser.role === "guest") {
    return <PlaceholderPage title="Faça login" emoji="🔒" description="Entre na sua conta para acessar o perfil." />;
  }

  const profile = state.profileData || {
    ...state.currentUser,
    phone_verified: false,
    avatar: null,
    default_address: null,
    save_address: 1,
  };

  const phoneVerified = profile.phone_verified;

  const handleSaveName = async () => {
    const trimmed = nameValue.trim();
    if (trimmed.length < 2) {
      dispatch({ type: "ADD_TOAST", payload: { type: "warning", message: "Nome precisa ter pelo menos 2 caracteres." } });
      return;
    }
    try {
      const data = await api("/profile/me", { method: "PUT", body: { name: trimmed } }, dispatch);
      if (data.user) {
        dispatch({ type: "SET_PROFILE_DATA", payload: data.user });
      }
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Nome atualizado!" } });
      setEditingName(false);
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao atualizar nome" } });
    }
  };

  const handleChangePassword = async () => {
    if (pwdNew.length < 6) {
      dispatch({ type: "ADD_TOAST", payload: { type: "warning", message: "A nova senha deve ter no mínimo 6 caracteres." } });
      return;
    }
    if (pwdNew !== pwdConfirm) {
      dispatch({ type: "ADD_TOAST", payload: { type: "warning", message: "A confirmação não coincide com a nova senha." } });
      return;
    }
    setPwdLoading(true);
    try {
      await api(
        "/profile/password",
        { method: "POST", body: { currentPassword: pwdCurrent, newPassword: pwdNew } },
        dispatch
      );
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Senha alterada com sucesso." } });
      setPwdCurrent("");
      setPwdNew("");
      setPwdConfirm("");
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Não foi possível alterar a senha" } });
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-24" style={getSiteBackgroundStyle(state.siteConfig)}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => dispatch({ type: "NAVIGATE", payload: "home" })}
              className="p-2 rounded-lg border border-white/10 text-zinc-300 hover:bg-white/5"
              aria-label="Voltar"
            >
              <ArrowRight size={16} className="rotate-180" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Meu Perfil
              </h1>
              <p className="text-zinc-500 text-sm">Gerencie seus dados pessoais, telefone e endereço padrão.</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30">
            {profile.role === "admin" ? "Admin" : "Cliente"}
          </span>
        </div>

        <div className="rounded-2xl border border-white/[0.08] p-6 flex flex-col sm:flex-row gap-6 items-start" style={{ background: "rgba(255,255,255,0.03)" }}>
          <AvatarUpload />
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Nome completo</p>
              <div className="flex items-center gap-2">
                {editingName ? (
                  <>
                    <input
                      value={nameValue}
                      onChange={e => setNameValue(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    />
                    <button
                      type="button"
                      onClick={handleSaveName}
                      className="px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-500"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingName(false); setNameValue(profile.name || ""); }}
                      className="px-3 py-2 rounded-lg border border-white/10 text-xs text-zinc-300 hover:bg-white/5"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-white font-medium text-sm">{profile.name}</p>
                    <button
                      type="button"
                      onClick={() => setEditingName(true)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5"
                    >
                      <Pencil size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">E-mail</p>
              <p className="text-sm text-zinc-300">{profile.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <p className="text-xs text-zinc-500 mb-1">Telefone</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-zinc-300">{profile.phone || "Não informado"}</p>
                  {phoneVerified ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                      <CheckCircle size={12} /> Verificado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-amber-500/15 text-amber-200 border border-amber-500/40">
                      <AlertTriangle size={12} /> Não verificado
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] p-6 space-y-4" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Lock size={16} className="text-violet-400" /> Alterar senha
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">Use uma senha forte e não reutilize em outros sites.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowPwdFields((s) => !s)}
              className="self-start sm:self-auto px-3 py-1.5 rounded-lg border border-white/10 text-xs text-zinc-300 hover:bg-white/5"
            >
              {showPwdFields ? "Ocultar" : "Alterar senha"}
            </button>
          </div>
          {showPwdFields && (
            <div className="space-y-3 max-w-md">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Senha atual</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={pwdCurrent}
                  onChange={(e) => setPwdCurrent(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Nova senha (mín. 6 caracteres)</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={pwdNew}
                  onChange={(e) => setPwdNew(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Confirmar nova senha</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={pwdConfirm}
                  onChange={(e) => setPwdConfirm(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="button"
                disabled={pwdLoading || !pwdCurrent || !pwdNew || !pwdConfirm}
                onClick={handleChangePassword}
                style={getButtonPrimaryGradientStyle(state.siteConfig)}
                className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
              >
                {pwdLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Salvando...
                  </>
                ) : (
                  "Salvar nova senha"
                )}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/[0.08] p-6 space-y-4" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-sm font-semibold text-white">Telefone & Verificação SMS</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Confirme a posse do seu número para mais segurança.</p>
              </div>
            </div>
            <PhoneVerificationFlow />
          </div>

          <div className="rounded-2xl border border-white/[0.08] p-6 space-y-4" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-sm font-semibold text-white">Endereço Padrão</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Use seu endereço salvo para agilizar o checkout.</p>
              </div>
            </div>
            <AddressSection />
          </div>
        </div>
      </div>
    </div>
  );
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN — VISÃO GERAL (INVENTÁRIO)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AdminOverview() {
  const { state, dispatch } = useApp();
  const [search, setSearch] = useState("");
  const [filterPill, setFilterPill] = useState("all");
  const [sortBy, setSortBy] = useState("stock");
  const [sortDir, setSortDir] = useState("asc");

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "SET_LOADING", payload: true });
    api("/inventory", {}, dispatch)
      .then(data => { if (!cancelled) dispatch({ type: "SET_INVENTORY", payload: data }); })
      .catch(() => { if (!cancelled) dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Erro ao carregar inventário" } }); })
      .finally(() => { if (!cancelled) dispatch({ type: "SET_LOADING", payload: false }); });
    return () => { cancelled = true; };
  }, [dispatch]);

  const inv = state.inventory;
  const summary = inv?.summary ?? {};
  const products = (inv?.products ?? []).filter(p => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()));
  const filtered = filterPill === "low" ? products.filter(p => p.stock >= 1 && p.stock <= 4) : filterPill === "out" ? products.filter(p => p.stock === 0) : products;
  const sorted = [...filtered].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    if (sortBy === "stock") return mul * (a.stock - b.stock);
    if (sortBy === "sold") return mul * ((a.totalSold ?? 0) - (b.totalSold ?? 0));
    return 0;
  });
  const maxStock = Math.max(1, ...sorted.map(p => p.stock));

  const categoryBadge = (cat) => {
    const c = { Eletrônicos: "bg-blue-500/15 text-blue-300", Roupas: "bg-pink-500/15 text-pink-300", Casa: "bg-amber-500/15 text-amber-300", Esportes: "bg-emerald-500/15 text-emerald-300" }[cat] || "bg-zinc-500/15 text-zinc-300";
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${c}`}>{cat}</span>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>Visão Geral</h1>
        <p className="text-zinc-500 text-sm mt-1">Admin &gt; Visão Geral</p>
      </div>
      {state.loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-white/[0.08] p-4 flex items-center gap-4" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center"><Package className="text-violet-400" size={24} /></div>
              <div><p className="text-2xl font-bold text-white">{summary.totalProducts ?? 0}</p><p className="text-sm text-zinc-400">Total Produtos</p></div>
            </div>
            <div className="rounded-xl border border-white/[0.08] p-4 flex items-center gap-4" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center"><Warehouse className="text-blue-400" size={24} /></div>
              <div><p className="text-2xl font-bold text-white">{summary.totalStock ?? 0} un.</p><p className="text-sm text-zinc-400">Estoque Total</p></div>
            </div>
            <div className="rounded-xl border border-white/[0.08] p-4 flex items-center gap-4" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center"><AlertTriangle className="text-amber-400" size={24} /></div>
              <div><p className="text-2xl font-bold text-white">{summary.lowStockCount ?? 0}</p><p className="text-sm text-zinc-400">Estoque Baixo</p></div>
            </div>
            <div className="rounded-xl border border-white/[0.08] p-4 flex items-center gap-4" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center"><XCircle className="text-rose-400" size={24} /></div>
              <div><p className="text-2xl font-bold text-white">{summary.outOfStockCount ?? 0}</p><p className="text-sm text-zinc-400">Esgotados</p></div>
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <div className="p-4 flex flex-wrap gap-3 border-b border-white/[0.04]">
              <input type="text" placeholder="Buscar por nome..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
              {["Todos", "Estoque Baixo", "Esgotados"].map((label, i) => {
                const v = ["all", "low", "out"][i];
                return <button key={v} onClick={() => setFilterPill(v)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterPill === v ? "bg-violet-500/20 text-violet-300" : "text-zinc-400 hover:bg-white/5"}`}>{label}</button>;
              })}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-zinc-500 text-xs uppercase tracking-wider border-b border-white/[0.04]">
                    <th className="p-3 font-medium">Produto</th>
                    <th className="p-3 font-medium">Categoria</th>
                    <th className="p-3 font-medium">Preço</th>
                    <th className="p-3 font-medium cursor-pointer" onClick={() => { setSortBy("stock"); setSortDir(s => s === "asc" ? "desc" : "asc"); }}>Estoque</th>
                    <th className="p-3 font-medium cursor-pointer" onClick={() => { setSortBy("sold"); setSortDir(s => s === "asc" ? "desc" : "asc"); }}>Vendidos</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Alerta</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(p => (
                    <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="p-3"><span className="inline-flex items-center gap-2"><ProductImage product={p} size="sm" className="!w-8 !h-8 rounded shrink-0" />{p.name}</span></td>
                      <td className="p-3">{categoryBadge(p.category)}</td>
                      <td className="p-3 text-white">{formatBRL(p.price)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-zinc-700 overflow-hidden"><div className={`h-full rounded-full ${p.stock === 0 ? "bg-rose-500" : p.stock <= 10 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${maxStock ? (p.stock / maxStock) * 100 : 0}%` }} /></div>
                          <span className="text-white">{p.stock}</span>
                        </div>
                      </td>
                      <td className="p-3 text-zinc-300">{p.totalSold ?? 0}</td>
                      <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${p.active ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-500/15 text-zinc-400"}`}>{p.active ? "Ativo" : "Inativo"}</span></td>
                      <td className="p-3">{p.stock === 0 ? <span className="px-2 py-0.5 rounded text-xs bg-rose-500/15 text-rose-300">Esgotado</span> : p.stock <= 4 ? <span className="px-2 py-0.5 rounded text-xs bg-amber-500/15 text-amber-300">Baixo</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sorted.length === 0 && <div className="p-8 text-center text-zinc-500">Nenhum produto encontrado.</div>}
          </div>
        </>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN — ATENDIMENTO (CHAT)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AdminSupport() {
  const { state, dispatch } = useApp();
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [localLoading, setLocalLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const loadConversations = () => {
    setLocalLoading(true);
    api("/chat/conversations", {}, dispatch)
      .then(data => dispatch({ type: "SET_CHAT_CONVERSATIONS", payload: data.conversations || [] }))
      .catch(() => dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Erro ao carregar conversas" } }))
      .finally(() => setLocalLoading(false));
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const poll = () => {
      api(`/chat/conversations/${selectedId}`, {}, dispatch)
        .then(data => {
          if (!cancelled) {
            dispatch({ type: "SET_CHAT_MESSAGES", payload: data.messages || [] });
          }
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedId, dispatch]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [state.chatMessages.length, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    api(`/chat/conversations/${selectedId}/read`, { method: "PATCH" }, dispatch).catch(() => {});
  }, [selectedId, dispatch]);

  useEffect(() => {
    if (state.adminPage === "support") {
      const pollUnread = () => {
        api("/chat/unread-count", {}, dispatch)
          .then(data => dispatch({ type: "SET_CHAT_UNREAD", payload: data.unread ?? 0 }))
          .catch(() => {});
      };
      pollUnread();
      const interval = setInterval(pollUnread, 5000);
      return () => clearInterval(interval);
    }
  }, [state.adminPage, dispatch]);

  const handleSelectConversation = (id) => {
    setSelectedId(id);
    setLocalLoading(true);
    api(`/chat/conversations/${id}`, {}, dispatch)
      .then(data => {
        dispatch({ type: "SET_CHAT_MESSAGES", payload: data.messages || [] });
        api(`/chat/conversations/${id}/read`, { method: "PATCH" }, dispatch).catch(() => {});
      })
      .catch(() => dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Erro ao carregar conversa" } }))
      .finally(() => setLocalLoading(false));
  };

  const handleSend = async (conversationId, content) => {
    if (!conversationId || !content.trim()) return;
    try {
      const data = await api(`/chat/conversations/${conversationId}/messages`, { method: "POST", body: { content } }, dispatch);
      dispatch({ type: "ADD_CHAT_MESSAGE", payload: data.message });
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao enviar mensagem" } });
    }
  };

  const handleCloseConversation = async (conversationId) => {
    if (!conversationId) return;
    try {
      await api(`/chat/conversations/${conversationId}/close`, { method: "PATCH" }, dispatch);
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Conversa encerrada." } });
      loadConversations();
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao encerrar conversa" } });
    }
  };

  const filterConversations = () => {
    const list = [...(state.chatConversations || [])];
    const filtered = list.filter(c => {
      if (filterStatus === "open" && c.status !== "open") return false;
      if (filterStatus === "closed" && c.status !== "closed") return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        (c.customer_name || "").toLowerCase().includes(q) ||
        (c.subject || "").toLowerCase().includes(q)
      );
    });
    return filtered.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
  };

  const conversations = filterConversations();
  const activeConv = conversations.find(c => c.id === selectedId) || conversations[0] || null;
  const [messageDraft, setMessageDraft] = useState("");

  useEffect(() => {
    if (!selectedId && activeConv) {
      setSelectedId(activeConv.id);
    }
  }, [activeConv, selectedId]);

  const renderMessage = (m) => {
    const isAdmin = m.sender_role === "admin";
    const name = isAdmin ? "Você" : (m.sender_name || "Cliente");
    const time = new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return (
      <div key={m.id} className={`flex mb-2 ${isAdmin ? "justify-end" : "justify-start"}`}>
        <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs shadow-sm ${isAdmin ? "bg-violet-600 text-white rounded-br-sm" : "bg-zinc-800 text-zinc-100 rounded-bl-sm"}`}>
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className={`font-semibold ${isAdmin ? "text-white/90" : "text-zinc-200"}`}>{name}</span>
            <span className={`${isAdmin ? "text-violet-100/80" : "text-zinc-400"}`}>{time}</span>
          </div>
          <p className="whitespace-pre-wrap break-words">{m.content}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>Atendimento</h1>
          <p className="text-zinc-500 text-sm">Admin &gt; Atendimento com clientes</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por cliente ou assunto..."
              className="w-56 sm:w-72 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>
          <div className="flex gap-1">
            {[
              { id: "all", label: "Todas" },
              { id: "open", label: "Abertas" },
              { id: "closed", label: "Fechadas" },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilterStatus(f.id)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  filterStatus === f.id ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "text-zinc-400 border border-white/10 hover:bg-white/5"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[420px]">
        <div className="md:col-span-1 rounded-xl border border-white/[0.08] overflow-hidden flex flex-col" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between text-xs text-zinc-400">
            <span>Conversas ({conversations.length})</span>
            {localLoading && <span className="flex items-center gap-1"><RefreshCw size={12} className="animate-spin" /> Atualizando</span>}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {conversations.length === 0 && (
              <div className="text-[11px] text-zinc-500 text-center py-8 px-3">
                Nenhuma conversa encontrada com os filtros atuais.
              </div>
            )}
            {conversations.map(conv => {
              const unread = conv.unread_count ?? 0;
              const updated = conv.updated_at ? new Date(conv.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
              const isActive = activeConv && activeConv.id === conv.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`w-full text-left rounded-xl px-3 py-2.5 border flex flex-col gap-1 transition-colors ${
                    isActive ? "border-violet-500/40 bg-violet-500/10" : "border-white/8 bg-white/0 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-xs text-violet-300 font-semibold">
                        {(conv.customer_name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {conv.customer_name || "Cliente"}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {conv.subject || "Atendimento"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] text-zinc-500">{updated}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                        conv.status === "closed" ? "bg-zinc-700 text-zinc-300" : "bg-emerald-500/15 text-emerald-300"
                      }`}>
                        {conv.status === "closed" ? "Fechada" : "Aberta"}
                      </span>
                    </div>
                  </div>
                  {unread > 0 && (
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-rose-300">Novas mensagens</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-semibold">
                        {unread}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="md:col-span-2 rounded-xl border border-white/[0.08] flex flex-col" style={{ background: "rgba(255,255,255,0.02)" }}>
          {!activeConv ? (
            <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">
              Selecione uma conversa à esquerda para começar o atendimento.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-violet-500/25 flex items-center justify-center text-sm text-violet-200 font-semibold">
                    {(activeConv.customer_name || "C").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {activeConv.customer_name || "Cliente"}
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {activeConv.subject || "Atendimento geral"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${
                    activeConv.status === "closed" ? "bg-zinc-700 text-zinc-300" : "bg-emerald-500/15 text-emerald-300"
                  }`}>
                    {activeConv.status === "closed" ? "Fechada" : "Aberta"}
                  </span>
                  {activeConv.status === "open" && (
                    <button
                      onClick={() => handleCloseConversation(activeConv.id)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-medium border border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                    >
                      Encerrar
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3">
                {state.chatMessages.length === 0 && (
                  <div className="h-full flex items-center justify-center text-xs text-zinc-500">
                    Nenhuma mensagem nesta conversa ainda.
                  </div>
                )}
                {state.chatMessages.map(renderMessage)}
                <div ref={messagesEndRef} />
              </div>

              <div className="px-4 py-3 border-t border-white/[0.06]">
                <div className={`flex items-end gap-2 rounded-xl px-2.5 py-2 ${activeConv.status === "closed" ? "bg-zinc-900/80 border border-zinc-800" : "bg-zinc-900/60 border border-white/10"}`}>
                  <textarea
                    value={messageDraft}
                    onChange={e => setMessageDraft(e.target.value)}
                    placeholder={activeConv.status === "closed" ? "Conversa encerrada" : "Digite sua mensagem para o cliente..."}
                    rows={2}
                    disabled={activeConv.status === "closed"}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (activeConv.status !== "closed") {
                          handleSend(activeConv.id, messageDraft);
                          setMessageDraft("");
                        }
                      }
                    }}
                    className="flex-1 bg-transparent border-none outline-none text-xs text-white placeholder-zinc-500 resize-none"
                  />
                  <button
                    onClick={() => { handleSend(activeConv.id, messageDraft); setMessageDraft(""); }}
                    disabled={activeConv.status === "closed" || !messageDraft.trim()}
                    className="w-9 h-9 rounded-full flex items-center justify-center bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ArrowRight size={16} className="rotate-180" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function maskCpf(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function maskCnpj(v) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function AdminPixSettings() {
  const { state, dispatch } = useApp();
  const [preview, setPreview] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (state.adminPixLoaded) return;
    api("/settings/pix", {}, dispatch)
      .then(data => {
        dispatch({ type: "SET_PIX_CONFIG", payload: data });
        dispatch({
          type: "SET_ADMIN_PIX_FORM",
          payload: {
            pixKey: data.pixKey || "",
            pixKeyType: data.pixKeyType || "cpf",
            pixBeneficiaryName: data.pixBeneficiaryName || "NovaMart",
            pixCity: data.pixCity || "Sao Paulo",
          },
        });
      })
      .catch(() => {})
      .finally(() => dispatch({ type: "SET_ADMIN_PIX_LOADED", payload: true }));
  }, [state.adminPixLoaded, dispatch]);

  const form = state.adminPixForm;

  const handleChangeKey = (val) => {
    let v = val;
    if (form.pixKeyType === "cpf") v = maskCpf(val);
    if (form.pixKeyType === "cnpj") v = maskCnpj(val);
    dispatch({ type: "SET_ADMIN_PIX_FORM", payload: { pixKey: v } });
  };

  const save = async () => {
    dispatch({ type: "SET_ADMIN_PIX_SAVING", payload: true });
    try {
      await api("/settings/pix", { method: "PUT", body: form }, dispatch);
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Chave PIX salva com sucesso." } });
      dispatch({ type: "SET_PIX_CONFIG", payload: { ...state.pixConfig, configured: true, ...form } });
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao salvar chave PIX" } });
    } finally {
      dispatch({ type: "SET_ADMIN_PIX_SAVING", payload: false });
    }
  };

  const testQr = async () => {
    setTesting(true);
    try {
      const d = await api("/settings/pix/generate", { method: "POST", body: { amount: 1.0, txId: "TESTE", description: "Teste PIX" } }, dispatch);
      setPreview(d);
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao gerar QR de teste" } });
    } finally {
      setTesting(false);
    }
  };

  const typeOptions = [
    { value: "cpf", label: "CPF", placeholder: "000.000.000-00" },
    { value: "cnpj", label: "CNPJ", placeholder: "00.000.000/0000-00" },
    { value: "email", label: "E-mail", placeholder: "contato@empresa.com" },
    { value: "phone", label: "Telefone", placeholder: "+55 (11) 99999-9999" },
    { value: "random", label: "Chave Aleatória", placeholder: "chave aleatória" },
  ];

  const currentType = typeOptions.find(t => t.value === form.pixKeyType) || typeOptions[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>Configurações PIX</h1>
        <p className="text-zinc-500 text-sm mt-1">Admin &gt; Chave PIX</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-white/[0.08] p-6 space-y-4" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Status</p>
            <div
              className={
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium " +
                (state.pixConfig?.configured
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-200")
              }
            >
              {state.pixConfig?.configured ? <>✅ Chave configurada</> : <>⚠️ Nenhuma chave configurada</>}
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Tipo de chave</label>
            <select
              value={form.pixKeyType}
              onChange={e => dispatch({ type: "SET_ADMIN_PIX_FORM", payload: { pixKeyType: e.target.value, pixKey: "" } })}
              className="w-full max-w-xs py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            >
              {typeOptions.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-zinc-900">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Chave PIX</label>
            <input
              value={form.pixKey}
              onChange={e => handleChangeKey(e.target.value)}
              placeholder={currentType.placeholder}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Nome do Beneficiário</label>
            <input
              value={form.pixBeneficiaryName}
              onChange={e => dispatch({ type: "SET_ADMIN_PIX_FORM", payload: { pixBeneficiaryName: e.target.value } })}
              placeholder="NovaMart"
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Cidade</label>
            <input
              value={form.pixCity}
              onChange={e => dispatch({ type: "SET_ADMIN_PIX_FORM", payload: { pixCity: e.target.value } })}
              placeholder="Sao Paulo"
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={testQr}
              disabled={testing}
              className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {testing ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Testando...</> : <>Gerar QR de teste</>}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={state.adminPixSaving}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-sm text-white font-semibold hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {state.adminPixSaving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Salvando...</> : <>Salvar Configurações</>}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] p-6 flex flex-col items-center justify-center gap-4" style={{ background: "rgba(255,255,255,0.03)" }}>
          <h2 className="text-sm font-semibold text-white mb-2">Preview do QR Code</h2>
          {preview ? (
            <>
              <div className="rounded-xl overflow-hidden border-4 border-white p-1 bg-white shadow-lg shadow-violet-500/10">
                <img src={preview.qrCodeUrl} alt="QR Code de teste" width={200} height={200} />
              </div>
              <p className="text-zinc-400 text-xs">Valor de teste: {formatBRL(preview.amount)}</p>
              <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 max-h-24 overflow-y-auto w-full text-left">
                <p className="text-zinc-300 text-[11px] font-mono break-all">{preview.payload}</p>
              </div>
            </>
          ) : (
            <p className="text-zinc-500 text-xs text-center max-w-xs">
              Configure a chave PIX e clique em &quot;Gerar QR de teste&quot; para visualizar um QR Code de R$ 1,00.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN — CONFIGURAÇÕES DO SITE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AdminSiteSettings() {
  const { state, dispatch } = useApp();
  const didInitRef = useRef(false);

  const defaultForm = {
    storeName: state.siteConfig?.storeName ?? "NovaMart",
    heroTitle: state.siteConfig?.heroTitle ?? "Sua experiência de compra, reinventada",
    heroDescription: state.siteConfig?.heroDescription ?? "Explore nossos produtos com qualidade garantida.",
    footerText: state.siteConfig?.footerText ?? "© 2025 NovaMart — Todos os direitos reservados",
    primaryColor: state.siteConfig?.primaryColor ?? "#8b5cf6",
    secondaryColor: state.siteConfig?.secondaryColor ?? "#6366f1",
    backgroundTopColor: state.siteConfig?.backgroundTopColor ?? "#0a0a14",
    backgroundBottomColor: state.siteConfig?.backgroundBottomColor ?? "#0f0f1a",
    backgroundImageOpacity: state.siteConfig?.backgroundImageOpacity ?? "0.35",
    btnPrimaryFrom: state.siteConfig?.btnPrimaryFrom ?? "#7c3aed",
    btnPrimaryTo: state.siteConfig?.btnPrimaryTo ?? "#6366f1",
    btnSecondary: state.siteConfig?.btnSecondary ?? "#7c3aed",
  };

  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState("");
  const [storeLogoFile, setStoreLogoFile] = useState(null);
  const [storeLogoPreviewUrl, setStoreLogoPreviewUrl] = useState("");
  const [backgroundFile, setBackgroundFile] = useState(null);
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState("");

  useEffect(() => {
    if (didInitRef.current) return;
    if (!state.siteConfigLoaded || !state.siteConfig) return;
    didInitRef.current = true;
    setForm({
      storeName: state.siteConfig.storeName ?? defaultForm.storeName,
      heroTitle: state.siteConfig.heroTitle ?? defaultForm.heroTitle,
      heroDescription: state.siteConfig.heroDescription ?? defaultForm.heroDescription,
      footerText: state.siteConfig.footerText ?? defaultForm.footerText,
      primaryColor: state.siteConfig.primaryColor ?? defaultForm.primaryColor,
      secondaryColor: state.siteConfig.secondaryColor ?? defaultForm.secondaryColor,
      backgroundTopColor: state.siteConfig.backgroundTopColor ?? defaultForm.backgroundTopColor,
      backgroundBottomColor: state.siteConfig.backgroundBottomColor ?? defaultForm.backgroundBottomColor,
      backgroundImageOpacity: state.siteConfig.backgroundImageOpacity ?? defaultForm.backgroundImageOpacity,
      btnPrimaryFrom: state.siteConfig.btnPrimaryFrom ?? defaultForm.btnPrimaryFrom,
      btnPrimaryTo: state.siteConfig.btnPrimaryTo ?? defaultForm.btnPrimaryTo,
      btnSecondary: state.siteConfig.btnSecondary ?? defaultForm.btnSecondary,
    });
  }, [state.siteConfigLoaded, state.siteConfig]);  

  const ensureLoaded = async () => {
    if (state.siteConfigLoaded && state.siteConfig) return;
    try {
      const d = await api("/settings/site", {}, dispatch);
      dispatch({ type: "SET_SITE_CONFIG", payload: d || {} });
      dispatch({ type: "SET_STORE_ICON", payload: d?.icon || "Store" });
    } catch {
      // best-effort
    }
  };

  useEffect(() => {
    ensureLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (bannerPreviewUrl) URL.revokeObjectURL(bannerPreviewUrl);
    };
  }, [bannerPreviewUrl]);

  useEffect(() => {
    return () => {
      if (storeLogoPreviewUrl) URL.revokeObjectURL(storeLogoPreviewUrl);
    };
  }, [storeLogoPreviewUrl]);

  useEffect(() => {
    return () => {
      if (backgroundPreviewUrl) URL.revokeObjectURL(backgroundPreviewUrl);
    };
  }, [backgroundPreviewUrl]);

  const onBannerChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (bannerPreviewUrl) URL.revokeObjectURL(bannerPreviewUrl);
    const url = URL.createObjectURL(file);
    setBannerFile(file);
    setBannerPreviewUrl(url);
  };

  const onStoreLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (storeLogoPreviewUrl) URL.revokeObjectURL(storeLogoPreviewUrl);
    const url = URL.createObjectURL(file);
    setStoreLogoFile(file);
    setStoreLogoPreviewUrl(url);
  };

  const onBackgroundChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (backgroundPreviewUrl) URL.revokeObjectURL(backgroundPreviewUrl);
    const url = URL.createObjectURL(file);
    setBackgroundFile(file);
    setBackgroundPreviewUrl(url);
  };

  const save = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("storeName", form.storeName || "NovaMart");
      fd.append("heroTitle", form.heroTitle || "");
      fd.append("heroDescription", form.heroDescription || "");
      fd.append("footerText", form.footerText || "");
      fd.append("primaryColor", form.primaryColor || "#8b5cf6");
      fd.append("secondaryColor", form.secondaryColor || "#6366f1");
      fd.append("backgroundTopColor", form.backgroundTopColor || "#0a0a14");
      fd.append("backgroundBottomColor", form.backgroundBottomColor || "#0f0f1a");
      fd.append("backgroundImageOpacity", form.backgroundImageOpacity ?? "0.35");
      fd.append("btnPrimaryFrom", form.btnPrimaryFrom ?? "#7c3aed");
      fd.append("btnPrimaryTo", form.btnPrimaryTo ?? "#6366f1");
      fd.append("btnSecondary", form.btnSecondary ?? "#7c3aed");
      if (bannerFile) fd.append("banner_image", bannerFile);
      if (storeLogoFile) fd.append("store_logo_image", storeLogoFile);
      if (backgroundFile) fd.append("site_background_image", backgroundFile);

      await api("/settings/site", { method: "PUT", body: fd }, dispatch);

      // refetch para sincronizar UI (e ícone do Header)
      const fresh = await api("/settings/site", {}, dispatch);
      dispatch({ type: "SET_SITE_CONFIG", payload: fresh || {} });

      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Configurações do site salvas com sucesso." } });
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err?.message || "Erro ao salvar configurações do site." } });
    } finally {
      setSaving(false);
    }
  };

  const removeBackgroundImage = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("removeBackgroundImage", "1");

      // Mantém os valores atuais para não causar mudanças de cor inesperadas
      fd.append("backgroundImageOpacity", form.backgroundImageOpacity ?? "0.35");
      fd.append("backgroundTopColor", form.backgroundTopColor || "#0a0a14");
      fd.append("backgroundBottomColor", form.backgroundBottomColor || "#0f0f1a");

      fd.append("btnPrimaryFrom", form.btnPrimaryFrom || "#7c3aed");
      fd.append("btnPrimaryTo", form.btnPrimaryTo || "#6366f1");
      fd.append("btnSecondary", form.btnSecondary || "#7c3aed");

      await api("/settings/site", { method: "PUT", body: fd }, dispatch);

      if (backgroundPreviewUrl) URL.revokeObjectURL(backgroundPreviewUrl);
      setBackgroundFile(null);
      setBackgroundPreviewUrl("");

      const fresh = await api("/settings/site", {}, dispatch);
      dispatch({ type: "SET_SITE_CONFIG", payload: fresh || {} });

      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Imagem de fundo removida." } });
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err?.message || "Erro ao remover imagem de fundo." } });
    } finally {
      setSaving(false);
    }
  };

  const previewSrc = bannerPreviewUrl || state.siteConfig?.bannerImageUrl || "";
  const storeLogoPreviewSrc = storeLogoPreviewUrl || state.siteConfig?.storeLogoImageUrl || "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>Configurações do Site</h1>
        <p className="text-zinc-500 text-sm mt-1">Admin &gt; Configurações</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-white/[0.08] p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Ícone do topo (imagem)</p>
            <div className="flex items-center gap-4 mb-3">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500/30 to-indigo-600/30 flex items-center justify-center border border-white/10 overflow-hidden">
                {storeLogoPreviewSrc ? (
                  <img src={storeLogoPreviewSrc} alt="Ícone do topo" className="w-full h-full object-contain p-1" />
                ) : (
                  <span className="text-zinc-400 text-xs">Sem imagem</span>
                )}
              </div>
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={onStoreLogoChange}
                  className="block w-full text-sm text-zinc-300"
                />
                <p className="text-zinc-500 text-xs mt-2">Substitui o ícone do topo imediatamente após salvar.</p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Nome da loja (todas as páginas)</label>
            <input
              value={form.storeName}
              onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              placeholder="NovaMart"
            />
          </div>

          <div>
            <p className="text-xs text-zinc-500 mb-1">Banner (imagem do site)</p>
            <input
              type="file"
              accept="image/*"
              onChange={onBannerChange}
              className="block w-full text-sm text-zinc-300 file:mr-4 file:py-2 file:px-3 file:rounded-xl file:border file:border-white/10 file:bg-white/5 file:text-zinc-200 hover:file:bg-white/10"
            />
            <p className="text-zinc-500 text-xs mt-2">Dica: se enviar uma imagem, ela substitui o banner atual.</p>
          </div>

          <div>
            <p className="text-xs text-zinc-500 mb-1">Cor de fundo (topo)</p>
            <input
              type="color"
              value={form.backgroundTopColor}
              onChange={(e) => setForm(f => ({ ...f, backgroundTopColor: e.target.value }))}
              className="w-full h-11 rounded-xl bg-white/5 border border-white/10"
            />
          </div>

          <div>
            <p className="text-xs text-zinc-500 mb-1">Cor de fundo (base)</p>
            <input
              type="color"
              value={form.backgroundBottomColor}
              onChange={(e) => setForm(f => ({ ...f, backgroundBottomColor: e.target.value }))}
              className="w-full h-11 rounded-xl bg-white/5 border border-white/10"
            />
          </div>

          <div>
            <p className="text-xs text-zinc-500 mb-1">Imagem de fundo do site</p>
            <input
              type="file"
              accept="image/*"
              onChange={onBackgroundChange}
              className="block w-full text-sm text-zinc-300 file:mr-4 file:py-2 file:px-3 file:rounded-xl file:border file:border-white/10 file:bg-white/5 file:text-zinc-200 hover:file:bg-white/10"
            />
            {backgroundPreviewUrl && (
              <img src={backgroundPreviewUrl} alt="Preview do fundo" className="mt-3 w-full h-24 object-cover rounded-xl border border-white/10" />
            )}
            <p className="text-zinc-500 text-xs mt-2">Se enviar imagem, ela substitui o gradiente de cores.</p>
          </div>

          <div>
            <p className="text-xs text-zinc-500 mb-1">
              Transparência da imagem de fundo (0% = imagem mais visível)
            </p>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={Number(form.backgroundImageOpacity ?? "0.35")}
              onChange={(e) => setForm((f) => ({ ...f, backgroundImageOpacity: e.target.value }))}
              className="w-full"
            />
            <div className="flex items-center justify-between text-xs text-zinc-500 mt-1">
              <span>0</span>
              <span>{Math.round(Number(form.backgroundImageOpacity ?? "0.35") * 100)}%</span>
              <span>100</span>
            </div>

            <div className="mt-3">
              <button
                type="button"
                onClick={removeBackgroundImage}
                disabled={saving || !(backgroundPreviewUrl || state.siteConfig?.backgroundImageUrl)}
                className="w-full px-4 py-2 rounded-xl border border-white/10 text-zinc-300 text-sm font-medium hover:bg-white/5 disabled:opacity-60 transition-all"
              >
                Remover imagem de fundo
              </button>
              <p className="text-zinc-500 text-xs mt-2">Remove a imagem (mantém as cores do gradiente).</p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Título do banner (Home)</label>
            <input
              value={form.heroTitle}
              onChange={(e) => setForm(f => ({ ...f, heroTitle: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Subtítulo (Home)</label>
            <textarea
              value={form.heroDescription}
              onChange={(e) => setForm(f => ({ ...f, heroDescription: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Texto de rodapé</label>
            <input
              type="text"
              value={form.footerText}
              onChange={(e) => setForm(f => ({ ...f, footerText: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Cor primária</label>
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                className="w-full h-11 rounded-xl bg-white/5 border border-white/10"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Cor secundária</label>
              <input
                type="color"
                value={form.secondaryColor}
                onChange={(e) => setForm(f => ({ ...f, secondaryColor: e.target.value }))}
                className="w-full h-11 rounded-xl bg-white/5 border border-white/10"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Botão primário (início)</label>
              <input
                type="color"
                value={form.btnPrimaryFrom}
                onChange={(e) => setForm(f => ({ ...f, btnPrimaryFrom: e.target.value }))}
                className="w-full h-11 rounded-xl bg-white/5 border border-white/10"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Botão primário (fim)</label>
              <input
                type="color"
                value={form.btnPrimaryTo}
                onChange={(e) => setForm(f => ({ ...f, btnPrimaryTo: e.target.value }))}
                className="w-full h-11 rounded-xl bg-white/5 border border-white/10"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Botão secundário</label>
              <input
                type="color"
                value={form.btnSecondary}
                onChange={(e) => setForm(f => ({ ...f, btnSecondary: e.target.value }))}
                className="w-full h-11 rounded-xl bg-white/5 border border-white/10"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-sm text-white font-semibold hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Salvando...</> : <>Salvar Configurações</>}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] p-6 flex flex-col items-center justify-center gap-4" style={{ background: "rgba(255,255,255,0.03)" }}>
          <h2 className="text-sm font-semibold text-white">Preview do Banner</h2>
          {previewSrc ? (
            <div className="relative w-full max-w-[420px] aspect-[16/9] rounded-2xl overflow-hidden border border-white/10">
              <img src={previewSrc} alt="Preview do banner" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-full max-w-[420px] aspect-[16/9] rounded-2xl border border-dashed border-white/15 flex items-center justify-center text-zinc-500 text-sm">
              Nenhum banner configurado
            </div>
          )}
          <div className="w-full max-w-[420px] bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-xs text-zinc-400">As cores e textos serão aplicados no layout (topo e home) assim que você salvar.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN — CRUD PRODUTOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AdminProducts() {
  const { state, dispatch } = useApp();
  const [search, setSearch] = useState("");
  const [modalProduct, setModalProduct] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "Eletrônicos", price: "", originalPrice: "", stock: "", image: "", active: true, imageFile: null, imagePreview: null, imageRemoved: false, currentImage: null });
  const [formErrors, setFormErrors] = useState({});
  const fileInputRef = useRef(null);

  const loadProducts = () => {
    api("/products?includeInactive=true", {}, dispatch)
      .then(d => d.products && dispatch({ type: "SET_ADMIN_PRODUCTS", payload: d.products }))
      .catch(() => dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Erro ao carregar produtos" } }));
  };

  useEffect(() => {
    loadProducts();
  }, [dispatch]);

  const list = state.adminProducts.filter(p => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()));

  const openCreate = () => {
    setForm({ name: "", description: "", category: "Eletrônicos", price: "", originalPrice: "", stock: "", image: "", active: true, imageFile: null, imagePreview: null, imageRemoved: false, currentImage: null });
    setFormErrors({});
    setModalProduct("new");
  };
  const openEdit = (p) => {
    setForm({ name: p.name, description: p.description || "", category: p.category || "Eletrônicos", price: String(p.price ?? ""), originalPrice: p.originalPrice != null ? String(p.originalPrice) : "", stock: String(p.stock ?? 0), image: p.image || "", active: !!p.active, imageFile: null, imagePreview: null, imageRemoved: false, currentImage: p.image || null });
    setFormErrors({});
    setModalProduct(p);
  };

  const handleImageSelect = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Imagem deve ter no máximo 5MB" } });
      setFormErrors(e => ({ ...e, image: "Máximo 5MB" }));
      return;
    }
    setFormErrors(e => ({ ...e, image: "" }));
    if (form.imagePreview) URL.revokeObjectURL(form.imagePreview);
    setForm(f => ({ ...f, imageFile: file, imagePreview: URL.createObjectURL(file), imageRemoved: false }));
  };
  const handleImageRemove = () => {
    if (form.imagePreview) URL.revokeObjectURL(form.imagePreview);
    setForm(f => ({ ...f, imageFile: null, imagePreview: null, imageRemoved: true }));
  };
  useEffect(() => {
    const prev = form.imagePreview;
    return () => { if (prev) URL.revokeObjectURL(prev); };
  }, [form.imagePreview]);

  const validate = () => {
    const e = {};
    if (!form.name.trim() || form.name.trim().length < 3) e.name = "Nome com pelo menos 3 caracteres";
    if (!form.description.trim()) e.description = "Descrição obrigatória";
    if (!form.price || Number(form.price) <= 0) e.price = "Preço obrigatório e maior que 0";
    if (form.originalPrice && Number(form.originalPrice) <= Number(form.price)) e.originalPrice = "Preço original deve ser maior que o preço";
    const stockNum = parseInt(form.stock, 10);
    if (isNaN(stockNum) || stockNum < 0) e.stock = "Estoque inteiro >= 0";
    setFormErrors(e);
    return !Object.keys(e).length;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const useFormData = form.imageFile || form.imageRemoved;
    const token = sessionStorage.getItem("novamart_token");
    const url = modalProduct === "new" ? "/api/products" : `/api/products/${modalProduct.id}`;
    const method = modalProduct === "new" ? "POST" : "PUT";
    try {
      let data;
      if (useFormData) {
        const fd = new FormData();
        fd.append("name", form.name.trim());
        fd.append("description", form.description.trim());
        fd.append("category", form.category);
        fd.append("price", form.price);
        if (form.originalPrice && Number(form.originalPrice) > 0) fd.append("originalPrice", form.originalPrice);
        fd.append("stock", form.stock);
        fd.append("active", form.active ? "1" : "0");
        if (form.imageFile) fd.append("image", form.imageFile);
        else if (form.imageRemoved) fd.append("image", getDefaultEmoji(form.category));
        const res = await fetch(url, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
        data = await res.json();
        if (!res.ok) throw { status: res.status, message: data.message || "Erro" };
      } else {
        const body = { name: form.name.trim(), description: form.description.trim(), category: form.category, price: parseFloat(form.price), stock: parseInt(form.stock, 10), active: form.active };
        if (form.originalPrice && Number(form.originalPrice) > 0) body.originalPrice = parseFloat(form.originalPrice);
        data = await api(modalProduct === "new" ? "/products" : `/products/${modalProduct.id}`, { method, body }, dispatch);
      }
      const product = data.product ?? data;
      if (modalProduct === "new") {
        dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Produto criado!" } });
        setModalProduct(null);
        loadProducts();
        api("/products", {}, dispatch).then(d => d.products && dispatch({ type: "SET_PRODUCTS", payload: d.products }));
      } else {
        dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Produto atualizado!" } });
        dispatch({ type: "UPDATE_ADMIN_PRODUCT", payload: { id: modalProduct.id, ...product } });
        setModalProduct(null);
        api("/products", {}, dispatch).then(d => d.products && dispatch({ type: "SET_PRODUCTS", payload: d.products }));
      }
    } catch (err) {
      if (err.status === 401 || err.status === 403) { sessionStorage.removeItem("novamart_token"); dispatch({ type: "LOGOUT" }); }
      setFormErrors({ general: err.message || "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (product) => {
    try {
      await api(`/products/${product.id}`, { method: "DELETE" }, dispatch);
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Produto desativado" } });
      dispatch({ type: "UPDATE_ADMIN_PRODUCT", payload: { id: product.id, active: false } });
      setDeleteConfirm(null);
      api("/products", {}, dispatch).then(d => d.products && dispatch({ type: "SET_PRODUCTS", payload: d.products }));
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message } });
    }
  };

  const toggleActive = async (p) => {
    try {
      const body = { ...p, active: !p.active };
      await api(`/products/${p.id}`, { method: "PUT", body }, dispatch);
      dispatch({ type: "UPDATE_ADMIN_PRODUCT", payload: { id: p.id, active: body.active } });
      api("/products", {}, dispatch).then(d => d.products && dispatch({ type: "SET_PRODUCTS", payload: d.products }));
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message } });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>Produtos</h1>
          <p className="text-zinc-500 text-sm mt-1">Admin &gt; Produtos ({list.length})</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm w-48 focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors"><Plus size={18} /> Novo Produto</button>
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.06] overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-zinc-500 text-xs uppercase tracking-wider border-b border-white/[0.04]">
              <th className="p-3 font-medium">Produto</th>
              <th className="p-3 font-medium">Categoria</th>
              <th className="p-3 font-medium">Preço</th>
              <th className="p-3 font-medium">Preço Orig.</th>
              <th className="p-3 font-medium">Estoque</th>
              <th className="p-3 font-medium">Ativo</th>
              <th className="p-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {list.map(p => (
              <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                <td className="p-3"><span className="inline-flex items-center gap-2"><ProductImage product={p} size="sm" className="!w-8 !h-8 rounded shrink-0" />{p.name}</span></td>
                <td className="p-3 text-zinc-300">{p.category}</td>
                <td className="p-3 text-white">{formatBRL(p.price)}</td>
                <td className="p-3 text-zinc-400">{p.originalPrice != null ? formatBRL(p.originalPrice) : "—"}</td>
                <td className="p-3 text-zinc-300">{p.stock}</td>
                <td className="p-3"><button type="button" onClick={() => toggleActive(p)} className={`px-2 py-1 rounded text-xs font-medium ${p.active ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-500/15 text-zinc-400"}`}>{p.active ? "Ativo" : "Inativo"}</button></td>
                <td className="p-3 flex items-center gap-2">
                  <button type="button" onClick={() => openEdit(p)} className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-violet-400" title="Editar"><Pencil size={16} /></button>
                  <button type="button" onClick={() => setDeleteConfirm(p)} className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-rose-400" title="Excluir"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="p-8 text-center text-zinc-500">Nenhum produto.</div>}
      </div>

      {modalProduct && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-overlay-in" onClick={() => !saving && setModalProduct(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#13131f] p-6 shadow-xl animate-modal-in" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-white mb-4">{modalProduct === "new" ? "Novo Produto" : `Editar: ${modalProduct.name}`}</h2>
              {formErrors.general && <p className="text-rose-400 text-sm mb-3">{formErrors.general}</p>}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">Imagem do Produto</label>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); e.target.value = ""; }} />
                  {form.imagePreview ? (
                    <div className="flex flex-col gap-2 max-w-[200px]">
                      <div className="relative w-full max-w-[200px] aspect-square rounded-xl overflow-hidden border-2 border-white/10 group">
                        <img src={form.imagePreview} alt="Preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30"><RefreshCw size={18} /></button>
                          <button type="button" onClick={handleImageRemove} className="p-2 rounded-lg bg-rose-500/80 text-white hover:bg-rose-500"><Trash2 size={18} /></button>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 truncate">{form.imageFile?.name} • {(form.imageFile?.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                  ) : form.currentImage && String(form.currentImage).startsWith("/") && !form.imageRemoved ? (
                    <div className="flex flex-col gap-2 max-w-[200px]">
                      <div className="relative w-full max-w-[200px] aspect-square rounded-xl overflow-hidden border-2 border-white/10 group">
                        <img src={form.currentImage} alt="Atual" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30">Trocar</button>
                          <button type="button" onClick={handleImageRemove} className="p-2 rounded-lg bg-rose-500/80 text-white hover:bg-rose-500"><Trash2 size={18} /></button>
                        </div>
                      </div>
                      <button type="button" onClick={handleImageRemove} className="text-xs text-rose-400 hover:underline">Remover imagem</button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("border-violet-500", "bg-violet-500/10", "scale-[1.02]"); }}
                      onDragLeave={e => { e.currentTarget.classList.remove("border-violet-500", "bg-violet-500/10", "scale-[1.02]"); }}
                      onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove("border-violet-500", "bg-violet-500/10", "scale-[1.02]"); const f = e.dataTransfer.files?.[0]; if (f) handleImageSelect(f); }}
                      className={`max-w-[200px] aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition-all bg-white/[0.02] border-white/15 hover:border-violet-500/40 hover:bg-violet-500/5 ${formErrors.image ? "border-rose-500" : ""}`}
                    >
                      <ImagePlus size={32} className="text-zinc-500" />
                      <span className="text-sm text-zinc-400 text-center px-2">Clique ou arraste uma imagem</span>
                      <span className="text-xs text-zinc-600">JPEG, PNG, WebP ou GIF • Máx 5MB</span>
                    </div>
                  )}
                  {formErrors.image && <p className="text-rose-400 text-xs mt-1">{formErrors.image}</p>}
                </div>
                <div><label className="block text-xs text-zinc-500 mb-1">Nome</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" placeholder="Nome do produto" />{formErrors.name && <p className="text-rose-400 text-xs mt-1">{formErrors.name}</p>}</div>
                <div><label className="block text-xs text-zinc-500 mb-1">Descrição</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm resize-none" placeholder="Descrição" />{formErrors.description && <p className="text-rose-400 text-xs mt-1">{formErrors.description}</p>}</div>
                <div><label className="block text-xs text-zinc-500 mb-1">Categoria</label><select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div className="grid grid-cols-2 gap-3"><div><label className="block text-xs text-zinc-500 mb-1">Preço (R$)</label><input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" placeholder="0.00" />{formErrors.price && <p className="text-rose-400 text-xs mt-1">{formErrors.price}</p>}</div><div><label className="block text-xs text-zinc-500 mb-1">Preço Original (R$)</label><input type="number" step="0.01" value={form.originalPrice} onChange={e => setForm(f => ({ ...f, originalPrice: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" placeholder="Opcional" /><p className="text-xs text-zinc-500 mt-1">Se preenchido, exibe preço riscado na loja</p>{formErrors.originalPrice && <p className="text-rose-400 text-xs mt-1">{formErrors.originalPrice}</p>}</div></div>
                <div className="grid grid-cols-2 gap-3"><div><label className="block text-xs text-zinc-500 mb-1">Estoque</label><input type="number" min="0" step="1" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" />{formErrors.stock && <p className="text-rose-400 text-xs mt-1">{formErrors.stock}</p>}</div><div className="flex items-center gap-2 pt-6"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="rounded border-white/20 text-violet-500 focus:ring-violet-500/40" /><span className="text-sm text-zinc-300">Ativo</span></label></div></div>
              </div>
              <div className="flex gap-3 mt-6"><button type="button" onClick={() => !saving && setModalProduct(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-zinc-300 text-sm font-medium hover:bg-white/5">Cancelar</button><button type="button" onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 flex items-center justify-center gap-2">{saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (modalProduct === "new" ? "Criar Produto" : "Salvar Alterações")}</button></div>
            </div>
          </div>
        </>
      )}

      {deleteConfirm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 animate-overlay-in" onClick={() => setDeleteConfirm(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="rounded-2xl border border-white/10 bg-zinc-900 p-6 max-w-sm w-full shadow-xl animate-modal-in">
              <h3 className="text-lg font-semibold text-white mb-2">Desativar produto?</h3>
              <p className="text-zinc-400 text-sm mb-6">Deseja desativar &quot;{deleteConfirm.name}&quot;? Ele não aparecerá mais na loja.</p>
              <div className="flex gap-3"><button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-zinc-300 text-sm font-medium">Cancelar</button><button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-500">Desativar</button></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN — GESTÃO USUÁRIOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AdminUsers() {
  const { state, dispatch } = useApp();
  const [search, setSearch] = useState("");
  const [rolePill, setRolePill] = useState("all");
  const [statusPill, setStatusPill] = useState("all");
  const [ordersModalUser, setOrdersModalUser] = useState(null);
  const [ordersModalList, setOrdersModalList] = useState([]);
  const [roleConfirm, setRoleConfirm] = useState(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", phone: "", password: "", role: "customer" });
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    if (!ordersModalUser) return;
    api(`/orders?userId=${encodeURIComponent(ordersModalUser.id)}`, {}, dispatch)
      .then(d => setOrdersModalList((d.orders || []).map(mapApiOrderToState)))
      .catch(() => setOrdersModalList([]));
  }, [ordersModalUser?.id, dispatch]);

  const loadUsers = () => {
    api("/users", {}, dispatch)
      .then(d => d.users && dispatch({ type: "SET_ADMIN_USERS", payload: d.users }))
      .catch(() => dispatch({ type: "ADD_TOAST", payload: { type: "error", message: "Erro ao carregar usuários" } }));
  };

  useEffect(() => {
    loadUsers();
  }, [dispatch]);

  let list = state.adminUsers.filter(u => !search.trim() || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()));
  if (rolePill === "admin") list = list.filter(u => u.role === "admin");
  if (rolePill === "customer") list = list.filter(u => u.role === "customer");
  if (statusPill === "active") list = list.filter(u => u.active !== false);
  if (statusPill === "inactive") list = list.filter(u => u.active === false);

  const handleToggleActive = async (user) => {
    if (user.id === state.currentUser?.id) return;
    try {
      const data = await api(`/users/${user.id}/toggle-active`, { method: "PATCH" }, dispatch);
      dispatch({ type: "UPDATE_ADMIN_USER", payload: { ...user, ...(data.user ?? {}), active: data.user?.active ?? !user.active } });
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: user.active ? "Usuário desativado" : "Usuário reativado" } });
    } catch (err) {
      const msg = err.message || (err.data?.message || "Erro");
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: msg.includes("admin") ? "Deve haver pelo menos 1 admin ativo" : msg } });
    }
  };

  const handleChangeRole = async (user, newRole) => {
    try {
      await api(`/users/${user.id}`, { method: "PUT", body: { role: newRole } }, dispatch);
      dispatch({ type: "UPDATE_ADMIN_USER", payload: { ...user, role: newRole } });
      setRoleConfirm(null);
      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Role atualizado" } });
    } catch (err) {
      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao alterar role" } });
    }
  };

  const openOrdersModal = (user) => {
    setOrdersModalUser(user);
  };

  const userOrders = ordersModalList;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>Usuários</h1>
        <p className="text-zinc-500 text-sm mt-1">Admin &gt; Usuários</p>
      </div>
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input type="text" placeholder="Buscar por nome ou e-mail..." value={search} onChange={e => setSearch(e.target.value)} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm min-w-[200px] focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
        <div className="flex gap-2">{[["Todos", "all"], ["Admins", "admin"], ["Clientes", "customer"]].map(([l, v]) => <button key={v} onClick={() => setRolePill(v)} className={`px-3 py-1.5 rounded-lg text-sm ${rolePill === v ? "bg-violet-500/20 text-violet-300" : "text-zinc-400 hover:bg-white/5"}`}>{l}</button>)}</div>
        <div className="flex gap-2">{[["Todos", "all"], ["Ativos", "active"], ["Desativados", "inactive"]].map(([l, v]) => <button key={v} onClick={() => setStatusPill(v)} className={`px-3 py-1.5 rounded-lg text-sm ${statusPill === v ? "bg-violet-500/20 text-violet-300" : "text-zinc-400 hover:bg-white/5"}`}>{l}</button>)}</div>
        <button
          type="button"
          onClick={() => { setCreateForm({ name: "", email: "", phone: "", password: "", role: "customer" }); setCreateModalOpen(true); }}
          className="ml-auto px-3 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium flex items-center gap-2 hover:bg-violet-500"
        >
          <UserPlus size={16} /> Novo Usuário
        </button>
      </div>
      <div className="rounded-xl border border-white/[0.06] overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-zinc-500 text-xs uppercase tracking-wider border-b border-white/[0.04]">
              <th className="p-3 font-medium">Usuário</th>
              <th className="p-3 font-medium">E-mail</th>
              <th className="p-3 font-medium">Telefone</th>
              <th className="p-3 font-medium">Role</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Pedidos</th>
              <th className="p-3 font-medium">Cadastro</th>
              <th className="p-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {list.map(u => (
              <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                <td className="p-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 flex items-center justify-center text-white text-sm font-bold">{u.name?.charAt(0)?.toUpperCase() || "?"}</div>{u.name}</div></td>
                <td className="p-3 text-zinc-300">{u.email}</td>
                <td className="p-3 text-zinc-300">{u.phone ? formatPhone(u.phone) : "—"}</td>
                <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${u.role === "admin" ? "bg-violet-500/15 text-violet-300" : "bg-zinc-500/15 text-zinc-300"}`}>{u.role === "admin" ? "Admin" : "Cliente"}</span></td>
                <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${u.active !== false ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>{u.active !== false ? "Ativo" : "Desativado"}</span></td>
                <td className="p-3 text-zinc-300">{u.orderCount ?? u.order_count ?? 0}</td>
                <td className="p-3 text-zinc-400">{u.createdAt ? formatDate(u.createdAt) : (u.created_at ? formatDate(u.created_at) : "—")}</td>
                <td className="p-3 flex items-center gap-2">
                  <button type="button" onClick={() => openOrdersModal(u)} className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-violet-400" title="Ver pedidos"><Package size={16} /></button>
                  <select value={u.role} onChange={e => { const v = e.target.value; if (v === u.role) return; setRoleConfirm({ user: u, newRole: v }); }} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-zinc-300 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/40" disabled={u.id === state.currentUser?.id}><option value="customer">Cliente</option><option value="admin">Admin</option></select>
                  <button type="button" onClick={() => u.id !== state.currentUser?.id && (u.active !== false ? setDeactivateConfirm(u) : handleToggleActive(u))} disabled={u.id === state.currentUser?.id} title={u.id === state.currentUser?.id ? "Não é possível desativar sua conta" : ""} className={`px-2 py-1 rounded text-xs font-medium ${u.active !== false ? "bg-emerald-500/15 text-emerald-300 hover:bg-rose-500/15 hover:text-rose-300" : "bg-rose-500/15 text-rose-300"}`}>{u.active !== false ? "Ativo" : "Desativado"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="p-8 text-center text-zinc-500">Nenhum usuário encontrado.</div>}
      </div>

      {ordersModalUser && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 animate-overlay-in" onClick={() => setOrdersModalUser(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="rounded-2xl border border-white/10 bg-zinc-900 p-6 max-w-md w-full max-h-[80vh] overflow-y-auto animate-modal-in">
              <h3 className="text-lg font-semibold text-white mb-4">Pedidos de {ordersModalUser.name}</h3>
              {userOrders.length === 0 ? <p className="text-zinc-500 text-sm">Nenhum pedido.</p> : <div className="space-y-3">{userOrders.map(o => { const cfg = STATUS_CONFIG[o.status]; return <div key={o.id} className="p-3 rounded-xl border border-white/10 bg-white/[0.02]"><div className="flex justify-between items-center"><span className="text-white font-medium">{o.id}</span><span className={`px-2 py-0.5 rounded text-xs ${cfg?.color}`}>{cfg?.label}</span></div><p className="text-zinc-500 text-xs mt-1">{formatDate(o.createdAt)} · {formatBRL(o.total)}</p></div>; })}</div>}
              <button onClick={() => setOrdersModalUser(null)} className="mt-4 w-full py-2 rounded-xl border border-white/10 text-zinc-300 text-sm">Fechar</button>
            </div>
          </div>
        </>
      )}

      {roleConfirm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 animate-overlay-in" onClick={() => setRoleConfirm(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="rounded-2xl border border-white/10 bg-zinc-900 p-6 max-w-sm w-full animate-modal-in">
              <h3 className="text-lg font-semibold text-white mb-2">{roleConfirm.newRole === "admin" ? "Promover a administrador?" : "Remover acesso admin?"}</h3>
              <p className="text-zinc-400 text-sm mb-6">{roleConfirm.newRole === "admin" ? `Promover ${roleConfirm.user.name} a administrador? Terá acesso ao painel.` : `Remover acesso admin de ${roleConfirm.user.name}?`}</p>
              <div className="flex gap-3"><button onClick={() => setRoleConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-zinc-300 text-sm">Cancelar</button><button onClick={() => handleChangeRole(roleConfirm.user, roleConfirm.newRole)} className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium">Confirmar</button></div>
            </div>
          </div>
        </>
      )}

      {deactivateConfirm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 animate-overlay-in" onClick={() => setDeactivateConfirm(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="rounded-2xl border border-white/10 bg-zinc-900 p-6 max-w-sm w-full animate-modal-in">
              <h3 className="text-lg font-semibold text-white mb-2">Desativar usuário?</h3>
              <p className="text-zinc-400 text-sm mb-6">Desativar {deactivateConfirm.name}? O usuário não poderá mais acessar a loja.</p>
              <div className="flex gap-3"><button onClick={() => setDeactivateConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-zinc-300 text-sm">Cancelar</button><button onClick={() => { handleToggleActive(deactivateConfirm); setDeactivateConfirm(null); }} className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-medium">Desativar</button></div>
            </div>
          </div>
        </>
      )}

      {createModalOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 animate-overlay-in" onClick={() => !createLoading && setCreateModalOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="rounded-2xl border border-white/10 bg-zinc-900 p-6 max-w-md w-full animate-modal-in">
              <h3 className="text-lg font-semibold text-white mb-1">Novo usuário</h3>
              <p className="text-zinc-500 text-xs mb-4">Preencha os dados para criar um usuário. A senha será utilizada no primeiro acesso.</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Nome completo</label>
                  <input
                    value={createForm.name}
                    onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    placeholder="Nome do usuário"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    placeholder="email@cliente.com"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Telefone</label>
                  <input
                    value={createForm.phone}
                    onChange={e => setCreateForm(f => ({ ...f, phone: formatPhone(e.target.value) }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Senha inicial</label>
                    <input
                      type="password"
                      value={createForm.password}
                      onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                      placeholder="mín. 6 caracteres"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Role</label>
                    <select
                      value={createForm.role}
                      onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    >
                      <option value="customer" className="bg-zinc-900">Cliente</option>
                      <option value="admin" className="bg-zinc-900">Admin</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  type="button"
                  onClick={() => !createLoading && setCreateModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-zinc-300 text-sm"
                  disabled={createLoading}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (createLoading) return;
                    setCreateLoading(true);
                    try {
                      const body = {
                        name: createForm.name,
                        email: createForm.email,
                        phone: createForm.phone,
                        password: createForm.password,
                        role: createForm.role,
                      };
                      const res = await api("/users", { method: "POST", body }, dispatch);
                      if (res.user) {
                        dispatch({ type: "SET_ADMIN_USERS", payload: [res.user, ...state.adminUsers] });
                      }
                      dispatch({ type: "ADD_TOAST", payload: { type: "success", message: "Usuário criado com sucesso." } });
                      setCreateModalOpen(false);
                    } catch (err) {
                      dispatch({ type: "ADD_TOAST", payload: { type: "error", message: err.message || "Erro ao criar usuário" } });
                    } finally {
                      setCreateLoading(false);
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-60 flex items-center justify-center gap-2"
                  disabled={createLoading}
                >
                  {createLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Criando...</> : <>Criar usuário</>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN — LAYOUT (SIDEBAR + CONTEÚDO)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AdminDashboard() {
  const { state, dispatch } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isAdmin = state.currentUser?.role === "admin";

  useEffect(() => {
    if (!isAdmin) dispatch({ type: "NAVIGATE", payload: "home" });
  }, [isAdmin, dispatch]);

  useEffect(() => {
    if (!isAdmin || state.storeIconLoaded) return;
    api("/settings/store", {}, dispatch)
      .then(data => dispatch({ type: "SET_STORE_ICON", payload: data?.icon || "Store" }))
      .catch(() => {});
  }, [isAdmin, state.storeIconLoaded, dispatch]);

  useEffect(() => {
    if (!isAdmin || state.siteConfigLoaded) return;
    api("/settings/site", {}, dispatch)
      .then(data => dispatch({ type: "SET_SITE_CONFIG", payload: data || {} }))
      .catch(() => {});
  }, [isAdmin, state.siteConfigLoaded, dispatch]);

  if (!isAdmin) return null;

  const storeIcon = state.storeIcon || "Store";
  const storeIconMap = {
    Store,
    Home,
    ShoppingCart,
    Package,
  };
  const StoreIconComp = storeIconMap[storeIcon] || Store;
  const storeLogoImageUrl = state.siteConfig?.storeLogoImageUrl || "";
  const hasStoreLogoImage = Boolean(storeLogoImageUrl);

  return (
    <div className="min-h-screen flex" style={getSiteBackgroundStyle(state.siteConfig)}>
      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-[240px] flex-shrink-0 border-r border-white/[0.06] flex flex-col transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`} style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between lg:justify-center">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => dispatch({ type: "NAVIGATE", payload: "home" })}
              className={`w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-90 transition-opacity ${hasStoreLogoImage ? "" : "bg-gradient-to-br from-violet-500 to-indigo-600"}`}
              aria-label="Ir para a home"
            >
              {hasStoreLogoImage ? (
                <img src={storeLogoImageUrl} alt="Logo da loja" className="w-full h-full object-contain p-1" style={{ background: "transparent" }} />
              ) : (
                <StoreIconComp size={18} className="text-white" />
              )}
            </button>
            <span className="font-bold text-white text-sm">{state.siteConfig?.storeName || "NovaMart"}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/20 text-violet-300">Admin</span>
          </div>
          <button type="button" onClick={() => setSidebarOpen(false)} className="lg:hidden p-2 rounded-lg hover:bg-white/5 text-zinc-400"><X size={18} /></button>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {[
            { id: "overview", label: "Visão Geral", icon: BarChart3 },
            { id: "products", label: "Produtos", icon: Package },
            { id: "users", label: "Usuários", icon: Users },
            { id: "support", label: "Atendimento", icon: MessageSquare },
            { id: "pix-settings", label: "Chave PIX", icon: Zap },
            { id: "site-settings", label: "Configurações", icon: Settings },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => { dispatch({ type: "SET_ADMIN_PAGE", payload: id }); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${state.adminPage === id ? "bg-violet-500/10 text-violet-400 border-l-2 border-violet-500 ml-0 pl-[14px]" : "text-zinc-400 hover:bg-white/5 border-l-2 border-transparent"}`}>
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 flex items-center justify-center text-white text-sm font-bold">{state.currentUser?.name?.charAt(0)?.toUpperCase() || "A"}</div>
            <div className="flex-1 min-w-0"><p className="text-white text-sm font-medium truncate">{state.currentUser?.name}</p><p className="text-zinc-500 text-xs truncate">{state.currentUser?.role}</p></div>
          </div>
          <button onClick={() => dispatch({ type: "NAVIGATE", payload: "home" })} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-colors">
            <ArrowRight size={16} className="rotate-180" /> Voltar à Loja
          </button>
        </div>
      </aside>
      {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />}
      <div className="flex-1 min-w-0 p-4 sm:p-6">
        <div className="lg:hidden mb-4">
          <button type="button" onClick={() => setSidebarOpen(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-zinc-400 text-sm">Menu</button>
        </div>
        {state.adminPage === "overview" && <AdminOverview />}
        {state.adminPage === "products" && <AdminProducts />}
        {state.adminPage === "users" && <AdminUsers />}
        {state.adminPage === "support" && <AdminSupport />}
        {state.adminPage === "pix-settings" && <AdminPixSettings />}
        {state.adminPage === "site-settings" && <AdminSiteSettings />}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PLACEHOLDER PAGES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PlaceholderPage({ title, emoji, description }) {
  const { state, dispatch } = useApp();
  return (
    <div className="min-h-screen flex items-center justify-center" style={getSiteBackgroundStyle(state.siteConfig)}>
      <div className="text-center">
        <span className="text-6xl block mb-4">{emoji}</span>
        <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
        <p className="text-zinc-500 text-sm mb-6">{description}</p>
        <button onClick={() => dispatch({ type: "NAVIGATE", payload: "home" })}
          className="px-6 py-3 rounded-xl bg-violet-600 text-white font-medium text-sm hover:bg-violet-500 transition-all shadow-lg shadow-violet-500/20">
          Voltar para a loja
        </button>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// APP ROUTER & EXPORT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AppRouter() {
  const { state, dispatch } = useApp();
  useIdleLogout(Boolean(state.currentUser), dispatch);

  if (state.currentPage === "auth" || !state.currentUser) return <AuthPage />;

  const pages = {
    home: <HomePage />,
    cart: <CartPage />,
    orders: <OrdersPage />,
    checkout: state.orderSuccess ? <OrderSuccessPage /> : <CheckoutPage />,
    profile: <ProfilePage />,
    "admin-dashboard": <AdminDashboard />,
  };

  return (
    <>
      <Header />
      <main className="animate-fade-in">{pages[state.currentPage] || <HomePage />}</main>
      {state.selectedProduct != null && <ProductDetailModal />}
      <CartDrawer />
      <ChatWidget />
    </>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    if (state.siteConfigLoaded) return;
    api("/settings/site/public", {}, dispatch)
      .then((data) => {
        dispatch({ type: "SET_SITE_CONFIG", payload: data || {} });
        if (data?.icon) dispatch({ type: "SET_STORE_ICON", payload: data.icon });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Título da guia = nome da loja (sanitizado: sem emoji / sufixo "E-Commerce" legado)
  useLayoutEffect(() => {
    if (!state.siteConfigLoaded) return;
    const raw = state.siteConfig?.storeName;
    const name = typeof raw === "string" ? raw.trim() : "";
    document.title = formatTabTitle(name || "NovaMart");
  }, [state.siteConfigLoaded, state.siteConfig?.storeName]);

  // Aplica dinamicamente as cores configuradas (Admin > Configurações do Site)
  // em TODOS os botões do site, evitando que fiquem presos ao violeta/indigo fixo.
  useEffect(() => {
    if (!state.siteConfigLoaded || !state.siteConfig) return;

    const btnPrimaryFrom = state.siteConfig.btnPrimaryFrom || state.siteConfig.primaryColor || "#7c3aed";
    const btnPrimaryTo = state.siteConfig.btnPrimaryTo || state.siteConfig.secondaryColor || "#6366f1";
    const btnSecondary = state.siteConfig.btnSecondary || state.siteConfig.secondaryColor || "#7c3aed";
    const primaryGradient = `linear-gradient(90deg, ${btnPrimaryFrom}, ${btnPrimaryTo})`;

    const buttons = Array.from(document.querySelectorAll("button"));
    for (const btn of buttons) {
      const cls = btn.className;
      if (typeof cls !== "string") continue;

      // Remove hover/focus que dependem de violeta/indigo fixos.
      const nextTokens = cls.split(/\s+/).filter((t) => {
        if (t.startsWith("hover:") && (t.includes("violet") || t.includes("indigo"))) return false;
        if (t.startsWith("focus:ring") && (t.includes("violet") || t.includes("indigo"))) return false;
        return true;
      });
      if (nextTokens.join(" ") !== cls) btn.className = nextTokens.join(" ");

      const hasGradientToken =
        cls.includes("bg-gradient-to-r") ||
        cls.includes("from-violet") ||
        cls.includes("to-indigo");

      const hasThemeToken = cls.includes("violet") || cls.includes("indigo");

      if (hasGradientToken || hasThemeToken) {
        btn.style.backgroundImage = primaryGradient;
        btn.style.backgroundColor = "transparent";
      } else {
        // Botões “neutros” também passam a obedecer a configuração.
        btn.style.backgroundImage = "none";
        btn.style.backgroundColor = hexToRgba(btnSecondary, 0.15);
      }

      // Contraste consistente
      btn.style.color = "#ffffff";

      // Se for botão “outline” (border claro) ou border-violet, sincroniza border também.
      const isOutlined =
        cls.includes("border-white") || cls.includes("border-violet") || cls.includes("border-indigo");
      if (isOutlined) {
        btn.style.borderColor = hexToRgba(btnSecondary, 0.35);
      }
    }
  }, [
    state.siteConfigLoaded,
    state.siteConfig?.btnPrimaryFrom,
    state.siteConfig?.btnPrimaryTo,
    state.siteConfig?.btnSecondary,
    state.siteConfig?.primaryColor,
    state.siteConfig?.secondaryColor,
  ]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <ToastContainer />
      <AdminOrderNotifier />
      <AppRouter />
    </AppContext.Provider>
  );
}
