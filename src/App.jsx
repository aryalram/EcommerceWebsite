import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { PaymentElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import "./App.css";

async function fetchProducts() {
  const response = await axios.get("/api/products");
  const items = response.data.items || response.data;
  return items.map((item) => ({
    ...item,
    price: Number(item.price),
    oldPrice: item.oldPrice ? Number(item.oldPrice) : null,
    discount: Number(item.discount || 0),
    stock: Number(item.stock || 0),
    tone: item.tone || "cream",
    imageUrl: item.imageUrl || item.image_url || null,
  }));
}

async function createOrder({ items, address, latitude, longitude }) {
  const response = await axios.post("/api/orders", {
    items: items.map(({ id, quantity }) => ({ id, quantity })),
    address,
    latitude,
    longitude,
  });
  return response.data;
}

async function createProduct(product, adminToken) {
  const formData = new FormData();
  Object.entries(product).forEach(([key, value]) => {
    if (key !== "image" && value !== null && value !== undefined) {
      formData.append(key, value);
    }
  });
  if (product.image) formData.append("image", product.image);
  const response = await axios.post("/api/products", formData, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  return response.data;
}

async function loginAdmin(email, password) {
  const response = await axios.post("/api/admin/login", { email, password });
  return response.data;
}

async function archiveProduct(id, adminToken) {
  const response = await axios.delete(`/api/products/${id}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  return response.data;
}

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null;

function PaymentForm({ orderId, onComplete }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function submitPayment(event) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (result.error) {
      setMessage(result.error.message || "Payment could not be completed.");
    } else if (result.paymentIntent?.status === "succeeded") {
      onComplete(`Order #${orderId} paid successfully.`);
    } else {
      setMessage("Payment is processing. Please keep this window open.");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={submitPayment} className="payment-form">
      <PaymentElement />
      {message && <p className="location-status">{message}</p>}
      <button className="primary-button full" disabled={submitting || !stripe}>
        {submitting ? "Processing payment..." : "Pay securely"} <span>→</span>
      </button>
    </form>
  );
}

const fallbackProducts = [
  {
    id: 1,
    name: "Noise-Cancelling Headphones",
    category: "Tech & gadgets",
    price: 189,
    oldPrice: 249,
    unit: "Wireless · Black",
    emoji: "🎧",
    tone: "peach",
    tag: "Best seller",
    imageUrl:
      "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: 2,
    name: "AeroPress Coffee Kit",
    category: "Kitchen & dining",
    price: 59,
    oldPrice: 79,
    unit: "Includes 2 filters",
    emoji: "☕",
    tone: "coral",
    tag: "New arrival",
    imageUrl:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: 3,
    name: "Cloud Cotton Lounge Set",
    category: "Fashion & essentials",
    price: 84,
    oldPrice: 120,
    unit: "2-piece set",
    emoji: "👕",
    tone: "green",
    tag: "",
    imageUrl:
      "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: 4,
    name: "Active Smart Watch",
    category: "Wellness",
    price: 219,
    oldPrice: 299,
    unit: "44mm · GPS",
    emoji: "⌚",
    tone: "gold",
    tag: "Limited drop",
    imageUrl:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: 5,
    name: "Insulated Water Bottle",
    category: "Lifestyle",
    price: 32,
    oldPrice: 45,
    unit: "750 ml",
    emoji: "🧴",
    tone: "yellow",
    tag: "Eco pick",
    imageUrl:
      "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: 6,
    name: "Minimal Desk Lamp",
    category: "Home essentials",
    price: 64,
    oldPrice: 89,
    unit: "Warm white LED",
    emoji: "💡",
    tone: "cream",
    tag: "Top rated",
    imageUrl:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80",
  },
];

const categories = [
  "All items",
  "Featured",
  "Tech & gadgets",
  "Home essentials",
  "Kitchen & dining",
  "Wellness",
  "Fashion & essentials",
  "Beauty & self care",
  "Office & productivity",
  "Travel accessories",
  "Lifestyle",
  "Home office",
];

function normalizeCategory(category) {
  return category.trim().toLowerCase().replace(/\s+/g, " ");
}

function App() {
  const routeLocation = useLocation();
  const navigate = useNavigate();
  const [inventory, setInventory] = useState(fallbackProducts);
  const [catalogStatus, setCatalogStatus] = useState("Connecting to store API...");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentClientSecret, setPaymentClientSecret] = useState("");
  const [paymentOrderId, setPaymentOrderId] = useState(null);
  const [adminToken, setAdminToken] = useState(
    () => window.localStorage.getItem("adminToken") || "",
  );
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminStatus, setAdminStatus] = useState("");
  const [location, setLocation] = useState("");
  const [locationCoords, setLocationCoords] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "Home essentials",
    price: "",
    unit: "",
    emoji: "📦",
    oldPrice: "",
    discount: "",
    offer: "",
    stock: "20",
    offerEndsAt: "",
    image: null,
  });
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    let isMounted = true;

    fetchProducts()
      .then((items) => {
        if (!isMounted) return;
        const nextItems = Array.isArray(items) && items.length ? items : fallbackProducts;
        setInventory(nextItems);
        setCatalogStatus(
          Array.isArray(items) && items.length
            ? "Live catalog synced from server.js"
            : "Demo catalog active while server.js is offline",
        );
      })
      .catch(() => {
        if (!isMounted) return;
        setInventory(fallbackProducts);
        setCatalogStatus("Demo catalog active — run server.js to use the live API");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [routeLocation.pathname]);

  const productMatch = routeLocation.pathname.match(/^\/product\/(\d+)$/);
  const categoryMatch = routeLocation.pathname.match(/^\/category\/([^/]+)$/);
  const selectedProduct = productMatch
    ? inventory.find((product) => product.id === Number(productMatch[1])) ||
      null
    : null;
  const routeCategory = categoryMatch
    ? decodeURIComponent(categoryMatch[1]).replace(/-/g, " ")
    : "All items";
  const activeCategory =
    categories.find(
      (category) =>
        normalizeCategory(category) === normalizeCategory(routeCategory),
    ) || "All items";
  const adminOpen = routeLocation.pathname === "/admin";
  const paymentRoute = routeLocation.pathname.match(/^\/payment\/(\d+)$/);

  function goToCategory(category) {
    navigate(
      category === "All items"
        ? "/shop"
        : `/category/${encodeURIComponent(category.toLowerCase().replace(/ /g, "-"))}`,
    );
  }

  function goToProduct(product) {
    navigate(`/product/${product.id}`);
  }

  function closeProduct() {
    navigate("/shop");
  }

  function offerCountdown(offerEndsAt) {
    if (!offerEndsAt) return "";
    const minutes = Math.max(
      0,
      Math.floor((new Date(offerEndsAt).getTime() - currentTime) / 60000),
    );
    return minutes > 0
      ? `Ends in ${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : "Offer ended";
  }

  const filteredProducts = useMemo(
    () =>
      inventory.filter((product) => {
        const matchesCategory =
          activeCategory === "All items" ||
          normalizeCategory(product.category) ===
            normalizeCategory(activeCategory);
        return (
          matchesCategory &&
          product.name.toLowerCase().includes(query.toLowerCase())
        );
      }),
    [activeCategory, inventory, query],
  );
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const subtotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );

  function addToCart(product) {
    setToast(`${product.name} added to your bag`);
    window.setTimeout(() => setToast(""), 2600);
    setCart((current) => {
      const found = current.find((item) => item.id === product.id);
      return found
        ? current.map((item) =>
            item.id === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          )
        : [...current, { ...product, quantity: 1 }];
    });
  }

  function addProduct(event) {
    event.preventDefault();
    if (!newProduct.name || !newProduct.price || !newProduct.unit) return;
    const oldPrice = Number(newProduct.oldPrice) || null;
    const discount = Math.min(100, Math.max(0, Number(newProduct.discount) || 0));
    const product = {
      ...newProduct,
      id: Date.now(),
      price: oldPrice && discount
        ? Number((oldPrice * (1 - discount / 100)).toFixed(2))
        : Number(newProduct.price),
      oldPrice,
      discount,
      offer: newProduct.offer || "New arrival",
      stock: Number(newProduct.stock) || 0,
      tone: "cream",
    };
    setInventory((current) => [...current, product]);
    createProduct(product, adminToken).catch((error) =>
      setCatalogStatus(
        error.response?.data?.message || "Could not save product to the server",
      ),
    );
    setNewProduct({
      name: "",
      category: "Home essentials",
      price: "",
      unit: "",
      emoji: "📦",
      oldPrice: "",
      discount: "",
      offer: "",
      stock: "20",
      offerEndsAt: "",
    });
    navigate("/");
    setToast("Product published to the market");
    window.setTimeout(() => setToast(""), 2600);
  }

  function changeQuantity(id, amount) {
    setCart((current) =>
      current
        .map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + amount } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("Location is not supported in this browser.");
      return;
    }
    setLocationStatus("Locating you...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocationCoords({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setLocation(
          `GPS pin: ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`,
        );
        setLocationStatus("Location pinned for delivery");
      },
      () =>
        setLocationStatus(
          "Could not access location. Enter your address instead.",
        ),
    );
  }

  async function placeOrder() {
    if (!location.trim()) {
      setLocationStatus(
        "Enter a delivery address or use your current location.",
      );
      return;
    }
    setOrderSubmitting(true);
    setLocationStatus("Creating your order...");
    try {
      const order = await createOrder({
        items: cart,
        address: location,
        latitude: locationCoords?.latitude,
        longitude: locationCoords?.longitude,
      });
      setPaymentOrderId(order.orderId);
      setPaymentClientSecret(order.clientSecret || "");
      if (!order.clientSecret) {
        setLocationStatus(
          "Payment is not configured. Add STRIPE_SECRET_KEY and restart the API.",
        );
        return;
      }
      setCheckoutOpen(false);
      navigate(`/payment/${order.orderId}`);
    } catch (error) {
      setLocationStatus(
        error.response?.data?.message ||
          "We could not create that order. Please try again.",
      );
    } finally {
      setOrderSubmitting(false);
    }
  }

  async function signInAdmin(event) {
    event.preventDefault();
    setAdminStatus("Signing in...");
    try {
      const result = await loginAdmin(adminEmail, adminPassword);
      setAdminToken(result.token);
      window.localStorage.setItem("adminToken", result.token);
      setAdminStatus(`Signed in as ${result.admin.email}`);
    } catch (error) {
      setAdminStatus(error.response?.data?.message || "Admin login failed");
    }
  }

  async function deleteProduct(product) {
    if (!adminToken || !window.confirm(`Archive ${product.name}?`)) return;
    try {
      await archiveProduct(product.id, adminToken);
      setInventory((current) => current.filter((item) => item.id !== product.id));
      setToast(`${product.name} archived`);
    } catch (error) {
      setToast(error.response?.data?.message || "Could not archive product");
    }
  }

  return (
    <div className={`app-shell${adminOpen ? " admin-route" : ""}`}>
      <div className="announcement">
        <span>●</span> New season essentials now live <strong>·</strong> Free
        shipping over $75
      </div>
      <header className="site-header">
        <a className="brand" href="/" aria-label="LumaCart home">
          <span>L</span>LumaCart
        </a>
        <nav>
          <a href="/shop">Shop</a>
          <a href="/#how-it-works">Why us</a>
          <a href="/#story">Our story</a>
        </nav>
        <div className="header-actions">
          <button className="location-pill" onClick={useMyLocation}>
            <span>⌖</span> Set delivery location
          </button>
          <button
            className="cart-button"
            onClick={() => setCartOpen(true)}
            aria-label={`Open cart with ${cartCount} items`}
          >
            <span>Bag</span>
            <b>{cartCount}</b>
          </button>
        </div>
      </header>

      <div className="mobile-search">
        <span>⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search essentials, tech & home"
          aria-label="Search products"
        />
        <button aria-label="Open LumaCart store">
          ✦ <b>LumaCart</b>
        </button>
      </div>
      <div className="mobile-categories">
        <button onClick={() => goToCategory("Home essentials")}>
          🏠
          <b>
            Home
            <br />
            essentials
          </b>
        </button>
        <button onClick={() => goToCategory("Tech & gadgets")}>
          🎧
          <b>
            Tech &
            <br />
            gadgets
          </b>
        </button>
        <button onClick={() => goToCategory("Wellness")}>
          🧘
          <b>
            Wellness
            <br />
            picks
          </b>
        </button>
        <button onClick={() => goToCategory("Fashion & essentials")}>
          👟
          <b>
            Style
            <br />
            essentials
          </b>
        </button>
      </div>

      <main>
        {selectedProduct && (
          <section className="product-detail-page">
            <button className="back-link" onClick={closeProduct}>
              ← Back to shopping
            </button>
            <div className={`detail-image ${selectedProduct.tone}`}>
              {selectedProduct.imageUrl ? (
                <img
                  className="product-photo"
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.name}
                />
              ) : (
                <span className="detail-emoji">{selectedProduct.emoji}</span>
              )}
            </div>
            <div className="detail-copy">
              <p className="eyebrow">{selectedProduct.category}</p>
              <h1>{selectedProduct.name}</h1>
              <p className="detail-unit">{selectedProduct.unit}</p>
              <p className="detail-description">
                Freshly selected and packed with care for delivery to your door.
              </p>
              <div className="detail-price">
                {selectedProduct.oldPrice && (
                  <del>NZ${selectedProduct.oldPrice.toFixed(2)}</del>
                )}
                <strong>NZ${selectedProduct.price.toFixed(2)}</strong>
              </div>
              <button
                className="primary-button"
                onClick={() => addToCart(selectedProduct)}
              >
                Add to bag <span>→</span>
              </button>
              <p className="stock-note">
                {selectedProduct.stock > 0
                  ? `${selectedProduct.stock} available today`
                  : "Currently out of stock"}
              </p>
            </div>
          </section>
        )}
        <section className="hero-section" id="home">
          <div className="hero-copy">
            <p className="eyebrow">Modern essentials, delivered</p>
            <h1>
              Curated for
              <br />
              <em>everyday life.</em>
            </h1>
            <p className="hero-text">
              Discover premium home, tech, wellness, and lifestyle finds chosen
              to make daily routines feel smoother, smarter, and more personal.
            </p>
            <div className="hero-buttons">
              <a className="primary-button" href="/shop">
                Shop the collection <span>↗</span>
              </a>
              <button className="text-button" onClick={useMyLocation}>
                ⌖ Find my store
              </button>
            </div>
            <div className="delivery-note">
              <span className="pulse-dot">●</span>
              <div>
                <strong>Fast delivery</strong>
                <small>Most orders arrive within 2–4 days</small>
              </div>
            </div>
          </div>
          <div className="hero-art">
            <div className="sun"></div>
            <div className="hero-label">
              FRESH
              <br />
              <strong>DAILY</strong>
            </div>
            <div className="basket">
              <div className="basket-handle"></div>
              <div className="basket-fill">
                🥖<span>🍅</span>🥬<i>🍋</i>
              </div>
            </div>
            <span className="scribble">picked with care</span>
          </div>
        </section>

        <section className="trust-strip" id="how-it-works">
          <div>
            <span className="trust-icon">✦</span>
            <div>
              <strong>Curated picks</strong>
              <small>Selected by real product teams</small>
            </div>
          </div>
          <div>
            <span className="trust-icon">⌁</span>
            <div>
              <strong>Trusted brands</strong>
              <small>Only well-reviewed essentials</small>
            </div>
          </div>
          <div>
            <span className="trust-icon">◷</span>
            <div>
              <strong>Fast shipping</strong>
              <small>Free over $75 with tracking</small>
            </div>
          </div>
        </section>

        <section className="shop-section" id="shop">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Best sellers</p>
              <h2>
                <span className="desktop-title">Shop the collection</span>
                <span className="mobile-title">Curated for you</span>
              </h2>
            </div>
            <div className="search-wrap">
              <span>⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search the catalog"
                aria-label="Search products"
              />
            </div>
          </div>
          <div className="category-row">
            {categories.map((category) => (
              <button
                key={category}
                className={activeCategory === category ? "active" : ""}
                onClick={() => goToCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="product-grid">
            {filteredProducts.map((product) => (
              <article
                className="product-card"
                key={product.id}
                onClick={() => goToProduct(product)}
              >
                <div className={`product-image ${product.tone}`}>
                  {product.imageUrl ? (
                    <img
                      className="product-photo"
                      src={product.imageUrl}
                      alt={product.name}
                    />
                  ) : (
                    <span className="product-emoji">{product.emoji}</span>
                  )}
                  {(product.offer || product.tag) && (
                    <span className="product-tag">
                      {product.offer || product.tag}
                    </span>
                  )}
                  {product.offerEndsAt && (
                    <span className="offer-countdown">
                      {offerCountdown(product.offerEndsAt)}
                    </span>
                  )}
                  <button
                    className="quick-add"
                    onClick={(event) => {
                      event.stopPropagation();
                      addToCart(product);
                    }}
                    aria-label={`Add ${product.name} to bag`}
                  >
                    +
                  </button>
                  {adminToken && (
                    <button
                      className="admin-delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteProduct(product);
                      }}
                      aria-label={`Archive ${product.name}`}
                    >
                      Archive
                    </button>
                  )}
                </div>
                <div className="product-info">
                  <div>
                    <h3>{product.name}</h3>
                    <p>{product.unit}</p>
                  </div>
                  <div className="price">
                    {product.oldPrice && (
                      <del>NZ${product.oldPrice.toFixed(2)}</del>
                    )}
                    <strong>NZ${product.price.toFixed(2)}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {filteredProducts.length === 0 && (
            <p className="empty-state">
              No products match that search yet.
            </p>
          )}
        </section>

        <div className="mobile-offer">
          <span>♙</span>
          <div>
            <strong>Free shipping unlocked</strong>
            <small>Orders over $75</small>
          </div>
        </div>

        <section className="story-section" id="story">
          <div className="story-image">
            <span>
              Since
              <br />
              <strong>2020</strong>
            </span>
            <div>✿</div>
          </div>
          <div className="story-copy">
            <p className="eyebrow">Thoughtful shopping</p>
            <h2>Essentials for real routines.</h2>
            <p>
              We curate products that feel useful, beautiful, and genuinely
              worth keeping around — from everyday tools to the pieces that make
              home and work easier every day.
            </p>
            <a href="/shop" className="underlined-link">
              Explore the collection <span>↗</span>
            </a>
          </div>
        </section>
      </main>
      <footer id="contact">
        <a className="brand" href="/">
          <span>L</span>LumaCart
        </a>
        <p>Designed for everyday living.</p>
        <div>
          <a href="/shop">Shop</a>
          <a href="/#story">About</a>
          <a href="/#contact">Contact</a>
        </div>
        <small>© 2026 LumaCart</small>
      </footer>

      {cartOpen && (
        <div className="overlay" onClick={() => setCartOpen(false)}>
          <aside
            className="drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Your order</p>
                <h2>
                  Your bag <span>({cartCount})</span>
                </h2>
              </div>
              <button
                className="close-button"
                onClick={() => setCartOpen(false)}
                aria-label="Close bag"
              >
                ×
              </button>
            </div>
            {cart.length === 0 ? (
              <div className="empty-cart">
                <span>🛍</span>
                <p>
                  Your bag is waiting
                  <br />
                  for something good.
                </p>
                <a href="/shop" onClick={() => setCartOpen(false)}>
                  Browse the market
                </a>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map((item) => (
                    <div className="cart-item" key={item.id}>
                      <div className={`mini-image ${item.tone}`}>
                        {item.emoji}
                      </div>
                      <div>
                        <strong>{item.name}</strong>
                        <small>
                          ${item.price.toFixed(2)} · {item.unit}
                        </small>
                        <div className="quantity">
                          <button onClick={() => changeQuantity(item.id, -1)}>
                            -
                          </button>
                          <span>{item.quantity}</span>
                          <button onClick={() => changeQuantity(item.id, 1)}>
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-summary">
                  <div>
                    <span>Subtotal</span>
                    <strong>${subtotal.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span>Delivery</span>
                    <strong>{subtotal >= 35 ? "Free" : "$3.50"}</strong>
                  </div>
                  <div className="total">
                    <span>Total</span>
                    <strong>
                      ${(subtotal + (subtotal >= 35 ? 0 : 3.5)).toFixed(2)}
                    </strong>
                  </div>
                  <button
                    className="primary-button full"
                    onClick={() => {
                      setCartOpen(false);
                      setCheckoutOpen(true);
                    }}
                  >
                    Continue to checkout <span>→</span>
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
      {checkoutOpen && (
        <div className="overlay" onClick={() => setCheckoutOpen(false)}>
          <section
            className="checkout-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setCheckoutOpen(false)}
              aria-label="Close checkout"
            >
              ×
            </button>
            <p className="eyebrow">Almost there</p>
            <h2>
              Where should we
              <br />
              <em>bring the good stuff?</em>
            </h2>
            <label htmlFor="address">Delivery address</label>
            <textarea
              id="address"
              value={location}
              onChange={(event) => {
                setLocation(event.target.value);
                setLocationCoords(null);
              }}
              placeholder="House number, street, city"
              rows="3"
            ></textarea>
            <button className="location-button" onClick={useMyLocation}>
              ⌖ Use my current location
            </button>
            {locationStatus && (
              <p className="location-status">{locationStatus}</p>
            )}
            {paymentRoute && paymentClientSecret && stripePromise && (
              <div className="overlay payment-page-overlay">
                <section className="checkout-modal payment-page">
                  <button
                    className="close-button"
                    onClick={() => navigate("/shop")}
                    aria-label="Close payment"
                  >
                    ×
                  </button>
                  <p className="eyebrow">Secure checkout</p>
                  <h2>
                    Complete your
                    <br />
                    <em>payment.</em>
                  </h2>
                  <p className="payment-note">
                    Order #{paymentOrderId || paymentRoute[1]} is reserved. Your
                    delivery address has been sent to the store.
                  </p>
                  <Elements
                    stripe={stripePromise}
                    options={{ clientSecret: paymentClientSecret }}
                  >
                    <PaymentForm
                      orderId={paymentOrderId || paymentRoute[1]}
                      onComplete={(message) => {
                        setCart([]);
                        setPaymentClientSecret("");
                        setCheckoutOpen(false);
                        setToast(message);
                        navigate(`/order/${paymentOrderId || paymentRoute[1]}`);
                        window.setTimeout(() => setToast(""), 2600);
                      }}
                    />
                  </Elements>
                </section>
              </div>
            )}
            <button
              className="primary-button full"
              onClick={placeOrder}
              disabled={orderSubmitting}
            >
              {orderSubmitting
                ? "Preparing secure payment..."
                : "Continue to payment"}{" "}
              <span>→</span>
            </button>
            <small className="payment-note">
              Your address and GPS location are shared with store staff for
              delivery.
            </small>
            {paymentClientSecret && stripePromise && (
              <Elements
                stripe={stripePromise}
                options={{ clientSecret: paymentClientSecret }}
              >
                <PaymentForm
                  orderId={paymentOrderId}
                  onComplete={(message) => {
                    setCart([]);
                    setCheckoutOpen(false);
                    setToast(message);
                    window.setTimeout(() => setToast(""), 2600);
                  }}
                />
              </Elements>
            )}
          </section>
        </div>
      )}
      {adminOpen && (
        <div className="overlay admin-overlay">
          <section className="admin-modal">
            <button
              className="close-button"
              onClick={() => navigate("/")}
              aria-label="Close admin panel"
            >
              ×
            </button>
            <p className="eyebrow">Store catalog · NZD</p>
            <h2>
              Add a product
              <br />
              <em>to your catalog.</em>
            </h2>
            <p className="admin-intro">
              {catalogStatus} Add products across your storefront categories.
              Prices, stock, offers, and media are saved in your database.
            </p>
            {!adminToken ? (
              <form onSubmit={signInAdmin} className="admin-form">
                <label>
                  Admin email
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(event) => setAdminEmail(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Admin password
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(event) => setAdminPassword(event.target.value)}
                    required
                  />
                </label>
                <button className="primary-button full" type="submit">
                  Sign in to manage catalog <span>→</span>
                </button>
                {adminStatus && <p className="location-status">{adminStatus}</p>}
              </form>
            ) : (
            <form onSubmit={addProduct} className="admin-form">
              <label>
                Item name
                <input
                  value={newProduct.name}
                  onChange={(event) =>
                    setNewProduct({ ...newProduct, name: event.target.value })
                  }
                  placeholder="e.g. Local strawberries"
                  required
                />
              </label>
              <div className="form-row">
                <label>
                  Category
                  <select
                    value={newProduct.category}
                    onChange={(event) =>
                      setNewProduct({
                        ...newProduct,
                        category: event.target.value,
                      })
                    }
                  >
                    {categories
                      .filter((category) => category !== "All items")
                      .map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Price
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newProduct.price}
                    onChange={(event) =>
                      setNewProduct({
                        ...newProduct,
                        price: event.target.value,
                      })
                    }
                    placeholder="0.00"
                    required
                  />
                </label>
                <label>
                  Was price
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newProduct.oldPrice}
                    onChange={(event) =>
                      setNewProduct({
                        ...newProduct,
                        oldPrice: event.target.value,
                      })
                    }
                    placeholder="Optional"
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Discount %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newProduct.discount}
                    onChange={(event) =>
                      setNewProduct({
                        ...newProduct,
                        discount: event.target.value,
                      })
                    }
                    placeholder="e.g. 20"
                  />
                </label>
                <label>
                  Offer label
                  <input
                    value={newProduct.offer}
                    onChange={(event) =>
                      setNewProduct({
                        ...newProduct,
                        offer: event.target.value,
                      })
                    }
                    placeholder="Save $2 today"
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Pack size
                  <input
                    value={newProduct.unit}
                    onChange={(event) =>
                      setNewProduct({ ...newProduct, unit: event.target.value })
                    }
                    placeholder="500 g"
                    required
                  />
                </label>
                <label>
                  Stock
                  <input
                    type="number"
                    min="0"
                    value={newProduct.stock}
                    onChange={(event) =>
                      setNewProduct({
                        ...newProduct,
                        stock: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Offer ends
                  <input
                    type="datetime-local"
                    value={newProduct.offerEndsAt}
                    onChange={(event) =>
                      setNewProduct({
                        ...newProduct,
                        offerEndsAt: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Icon
                  <input
                    value={newProduct.emoji}
                    onChange={(event) =>
                      setNewProduct({
                        ...newProduct,
                        emoji: event.target.value,
                      })
                    }
                    maxLength="2"
                  />
                </label>
              </div>
              <label>
                Product image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) =>
                    setNewProduct({
                      ...newProduct,
                      image: event.target.files[0] || null,
                    })
                  }
                />
              </label>
              <button className="primary-button full" type="submit">
                Publish item <span>→</span>
              </button>
            </form>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>✓</span>
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
      <nav className="mobile-bottom-nav">
        <a className="selected" href="/">
          <span>⌂</span>Home
        </a>
        <a href="/shop">
          <span>⊞</span>Categories
        </a>
        <button onClick={() => setCartOpen(true)}>
          <span>♧</span>Buy Again
        </button>
        <a href="/#story">
          <span>✺</span>Spotlight
        </a>
      </nav>
    </div>
  );
}

export default App;
