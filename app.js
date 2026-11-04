// ---------- DATA ----------
// readData, writeData, formatPrice and defaultSettings come from data.js
// "db" (the database connection) comes from config.js
let products = [];
let areas = [];
let settings = Object.assign({}, defaultSettings);

// The logged-in customer's saved details (null when nobody is logged in)
let customerProfile = null;

// The cart is saved as { productId: quantity } so it survives a page refresh
let cart = readData('madallaCart', {});

let searchText = '';
let activeCategory = 'All';

function saveCart() {
  writeData('madallaCart', cart);
}

function findProduct(id) {
  return products.find(function (p) { return p.id === Number(id); });
}

// ---------- DELIVERY AREAS AND FEE ----------
function selectedArea() {
  const value = document.getElementById('areaSelect').value;
  return areas.find(function (a) { return String(a.id) === value; });
}

// With delivery areas, the fee comes from the chosen area.
// Without any areas, the single fee from Settings is used.
function deliveryFee() {
  if (areas.length) {
    const area = selectedArea();
    return area ? area.fee : 0;
  }
  return Number(settings.deliveryFee) || 0;
}

function renderAreaSelect() {
  const select = document.getElementById('areaSelect');
  select.innerHTML = '';

  const first = document.createElement('option');
  first.value = '';
  first.textContent = 'Choose your area...';
  select.appendChild(first);

  areas.forEach(function (area) {
    const option = document.createElement('option');
    option.value = area.id;
    option.textContent = area.name + ' (' + formatPrice(area.fee) + ')';
    select.appendChild(option);
  });
}

// Items sold "per kg" go up in half-kilo steps. Everything else goes up by 1.
function isKg(product) {
  return !!product && /kg/i.test(product.unit || '');
}

function stepFor(product) {
  return isKg(product) ? 0.5 : 1;
}

function qtyLabel(product, quantity) {
  return isKg(product) ? quantity + ' kg' : String(quantity);
}

function cartTotal() {
  let total = 0;
  for (const id in cart) {
    const product = findProduct(id);
    if (product && product.available) total += product.price * cart[id];
  }
  return Math.round(total * 100) / 100;
}

// Counts the different items in the cart
function cartCount() {
  let count = 0;
  for (const id in cart) {
    const product = findProduct(id);
    if (product && product.available) count++;
  }
  return count;
}

// Adds an amount of a product to the cart
function addAmountToCart(id, amount) {
  cart[id] = Math.round(((cart[id] || 0) + amount) * 100) / 100;
  saveCart();
  renderCart();
}

// direction is +1 or -1
function changeQty(id, direction) {
  const product = findProduct(id);
  const next = (cart[id] || 0) + direction * stepFor(product);
  cart[id] = Math.round(next * 100) / 100;
  if (cart[id] <= 0) delete cart[id];
  saveCart();
  renderCart();
}

// ---------- "ADDED TO CART" MESSAGE ----------
let toastTimer = null;

function showToast(text) {
  const toast = document.getElementById('toast');
  toast.textContent = text;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toast.classList.add('hidden');
  }, 2200);
}

// ---------- PRODUCT POPUP ----------
const productModal = document.getElementById('productModal');
let popupProduct = null;
let popupQty = 1;

function openProduct(product) {
  popupProduct = product;
  popupQty = 1;
  renderProductPopup();
  productModal.classList.remove('hidden');
}

function closeProductPopup() {
  productModal.classList.add('hidden');
  popupProduct = null;
}

function renderProductPopup() {
  const p = popupProduct;
  const box = document.getElementById('productDetail');
  box.innerHTML = '';

  // Photo, or a coloured letter if the admin has not added one
  if (p.image) {
    const photo = document.createElement('img');
    photo.className = 'photo';
    photo.src = p.image;
    photo.alt = p.name;
    box.appendChild(photo);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'photo placeholder';
    placeholder.textContent = p.name.charAt(0).toUpperCase();
    box.appendChild(placeholder);
  }

  const name = document.createElement('h3');
  name.className = 'product-name';
  name.textContent = p.name;
  box.appendChild(name);

  const price = document.createElement('p');
  price.className = 'price';
  price.textContent = formatPrice(p.price) + ' ' + p.unit;
  box.appendChild(price);

  if (cart[p.id]) {
    const inCart = document.createElement('p');
    inCart.className = 'hint';
    inCart.textContent = 'Already in your cart: ' + qtyLabel(p, cart[p.id]);
    box.appendChild(inCart);
  }

  // Quantity buttons
  const row = document.createElement('div');
  row.className = 'qty-row';

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.textContent = '−';
  minus.addEventListener('click', function () {
    popupQty = Math.max(stepFor(p), Math.round((popupQty - stepFor(p)) * 100) / 100);
    renderProductPopup();
  });

  const number = document.createElement('span');
  number.textContent = qtyLabel(p, popupQty);

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.textContent = '+';
  plus.addEventListener('click', function () {
    popupQty = Math.min(100, Math.round((popupQty + stepFor(p)) * 100) / 100);
    renderProductPopup();
  });

  row.appendChild(minus);
  row.appendChild(number);
  row.appendChild(plus);
  box.appendChild(row);

  const subtotal = document.createElement('p');
  subtotal.className = 'total';
  subtotal.textContent = 'Subtotal: ' + formatPrice(Math.round(p.price * popupQty * 100) / 100);
  box.appendChild(subtotal);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'primary';
  addBtn.textContent = 'Add to cart';
  addBtn.addEventListener('click', function () {
    addAmountToCart(p.id, popupQty);
    showToast('✓ Added to cart: ' + qtyLabel(p, popupQty) + ' × ' + p.name);
    closeProductPopup();
  });
  box.appendChild(addBtn);
}

document.getElementById('closeProduct').addEventListener('click', closeProductPopup);

// Tapping the dark area around the popup also closes it
productModal.addEventListener('click', function (event) {
  if (event.target === productModal) closeProductPopup();
});

document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && popupProduct) closeProductPopup();
});

// ---------- LOGO ----------
function renderLogo() {
  const logo = document.getElementById('logo');
  if (settings.logoUrl) {
    logo.src = settings.logoUrl;
    logo.classList.remove('hidden');
  } else {
    logo.classList.add('hidden');
  }
}

// ---------- CATEGORY BUTTONS ----------
function categoryNames() {
  const names = [];
  products.forEach(function (p) {
    if (!names.includes(p.category)) names.push(p.category);
  });
  return names;
}

function renderChips() {
  const box = document.getElementById('chips');
  box.innerHTML = '';

  ['All'].concat(categoryNames()).forEach(function (name) {
    const btn = document.createElement('button');
    btn.className = name === activeCategory ? 'chip active' : 'chip';
    btn.textContent = name;
    btn.addEventListener('click', function () {
      activeCategory = name;
      renderChips();
      renderMenu();
    });
    box.appendChild(btn);
  });
}

document.getElementById('search').addEventListener('input', function (event) {
  searchText = event.target.value.trim().toLowerCase();
  renderMenu();
});

// ---------- SHOW PRODUCTS ----------
function renderMenu() {
  const menu = document.getElementById('menu');
  menu.innerHTML = '';
  let shown = 0;

  categoryNames().forEach(function (categoryName) {
    if (activeCategory !== 'All' && activeCategory !== categoryName) return;

    const matches = products.filter(function (p) {
      return p.category === categoryName &&
             p.name.toLowerCase().includes(searchText);
    });
    if (matches.length === 0) return;

    const title = document.createElement('h2');
    title.textContent = categoryName;
    menu.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'grid';

    matches.forEach(function (p) {
      shown++;
      const card = document.createElement('div');
      card.className = p.available ? 'card clickable' : 'card soldout';

      // Photo set by the admin. Without one, show a coloured letter instead.
      if (p.image) {
        const photo = document.createElement('img');
        photo.className = 'photo';
        photo.src = p.image;
        photo.alt = p.name;
        photo.loading = 'lazy';
        card.appendChild(photo);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'photo placeholder';
        placeholder.textContent = p.name.charAt(0).toUpperCase();
        card.appendChild(placeholder);
      }

      const name = document.createElement('h3');
      name.textContent = p.name;

      const unit = document.createElement('p');
      unit.className = 'unit';
      unit.textContent = p.unit;

      card.appendChild(name);
      card.appendChild(unit);

      if (p.available) {
        const price = document.createElement('p');
        price.className = 'price';
        price.textContent = formatPrice(p.price);

        const hint = document.createElement('p');
        hint.className = 'tap-hint';
        hint.textContent = 'Tap to order';

        card.appendChild(price);
        card.appendChild(hint);

        // Tapping the card (or pressing Enter on it) opens the popup
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.addEventListener('click', function () { openProduct(p); });
        card.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') openProduct(p);
        });
      } else {
        const badge = document.createElement('p');
        badge.className = 'badge';
        badge.textContent = 'Sold out';
        card.appendChild(badge);
      }

      grid.appendChild(card);
    });

    menu.appendChild(grid);
  });

  if (shown === 0) {
    const none = document.createElement('p');
    none.textContent = 'No items found.';
    menu.appendChild(none);
  }
}

// ---------- SHOW CART ----------
function renderCart() {
  const box = document.getElementById('cartItems');
  box.innerHTML = '';

  let hasItems = false;

  for (const id in cart) {
    const product = findProduct(id);
    if (!product || !product.available) continue; // skip items that were switched off
    hasItems = true;

    const row = document.createElement('div');
    row.className = 'cart-row';

    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = product.name;
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = formatPrice(product.price) + ' ' + product.unit;
    info.appendChild(name);
    info.appendChild(sub);

    const qty = document.createElement('div');
    qty.className = 'qty';

    const minus = document.createElement('button');
    minus.textContent = '−';
    minus.addEventListener('click', function () { changeQty(id, -1); });

    const number = document.createElement('span');
    number.textContent = qtyLabel(product, cart[id]);

    const plus = document.createElement('button');
    plus.textContent = '+';
    plus.addEventListener('click', function () { changeQty(id, 1); });

    qty.appendChild(minus);
    qty.appendChild(number);
    qty.appendChild(plus);

    row.appendChild(info);
    row.appendChild(qty);
    box.appendChild(row);
  }

  if (!hasItems) {
    const empty = document.createElement('p');
    empty.textContent = 'Your cart is empty.';
    box.appendChild(empty);
  }

  document.getElementById('cartCount').textContent = cartCount();
  document.getElementById('cartTotal').textContent = formatPrice(cartTotal());
  document.getElementById('checkoutBtn').disabled = !hasItems;
}

// ---------- CART PANEL OPEN / CLOSE ----------
const cartPanel = document.getElementById('cartPanel');

document.getElementById('cartBtn').addEventListener('click', function () {
  cartPanel.classList.remove('hidden');
});
document.getElementById('closeCart').addEventListener('click', function () {
  cartPanel.classList.add('hidden');
});

// ---------- CHECKOUT ----------
const checkoutModal = document.getElementById('checkoutModal');
const addressBox = document.getElementById('addressBox');
const addressInput = document.getElementById('address');
const areaBox = document.getElementById('areaBox');
const areaSelect = document.getElementById('areaSelect');

function selectedFulfillment() {
  return document.querySelector('input[name="fulfillment"]:checked').value;
}

function selectedPayment() {
  return document.querySelector('input[name="payment"]:checked').value;
}

function hasBankDetails() {
  return !!(settings.accountNumber && settings.bankName);
}

function addBankLine(box, label, value) {
  const p = document.createElement('p');
  const left = document.createElement('span');
  left.textContent = label;
  const right = document.createElement('strong');
  right.textContent = value;
  p.appendChild(left);
  p.appendChild(right);
  box.appendChild(p);
}

// Shows the bank transfer option only when the admin has saved bank details
function updatePaymentOptions(total) {
  const option = document.getElementById('transferOption');
  const box = document.getElementById('bankBox');

  option.classList.toggle('hidden', !hasBankDetails());
  box.innerHTML = '';

  if (hasBankDetails() && selectedPayment() === 'transfer') {
    box.classList.remove('hidden');
    addBankLine(box, 'Bank', settings.bankName);
    addBankLine(box, 'Account number', settings.accountNumber);
    addBankLine(box, 'Account name', settings.accountName);
    addBankLine(box, 'Amount to pay', formatPrice(total));
    const hint = document.createElement('p');
    hint.textContent = 'Place your order first. Then transfer and use your order number as the reference.';
    box.appendChild(hint);
  } else {
    box.classList.add('hidden');
  }
}

function updateSummary() {
  const isDelivery = selectedFulfillment() === 'delivery';
  const fee = isDelivery ? deliveryFee() : 0;
  const total = cartTotal() + fee;

  addressBox.classList.toggle('hidden', !isDelivery);
  addressInput.required = isDelivery;

  // The area list only shows for delivery, and only when the admin added areas
  const needsArea = isDelivery && areas.length > 0;
  areaBox.classList.toggle('hidden', !needsArea);
  areaSelect.required = needsArea;

  document.getElementById('sumItems').textContent = formatPrice(cartTotal());
  document.getElementById('sumFee').textContent = formatPrice(fee);
  document.getElementById('sumTotal').textContent = formatPrice(total);

  updatePaymentOptions(total);
}

// Fills in the customer's saved details (only into empty boxes)
function prefillCheckout() {
  if (!customerProfile) return;

  const nameInput = document.getElementById('fullName');
  const phoneInput = document.getElementById('phone');

  if (!nameInput.value && customerProfile.full_name) nameInput.value = customerProfile.full_name;
  if (!phoneInput.value && customerProfile.phone) phoneInput.value = customerProfile.phone;
  if (!addressInput.value && customerProfile.address) addressInput.value = customerProfile.address;
}

function openCheckout() {
  cartPanel.classList.add('hidden');
  checkoutModal.classList.remove('hidden');
  prefillCheckout();
  updateSummary();
}

// Checkout needs an account. Anyone not logged in is sent to the login page,
// and brought back here afterwards with their cart still saved.
document.getElementById('checkoutBtn').addEventListener('click', async function () {
  const { data } = await db.auth.getSession();

  if (!data.session) {
    location.href = 'login.html?need=1&next=' + encodeURIComponent('index.html?checkout=1');
    return;
  }

  if (customerProfile === null) await loadCustomer();
  openCheckout();
});

document.getElementById('closeCheckout').addEventListener('click', function () {
  checkoutModal.classList.add('hidden');
});

document.querySelectorAll('input[name="fulfillment"], input[name="payment"]').forEach(function (radio) {
  radio.addEventListener('change', updateSummary);
});

areaSelect.addEventListener('change', updateSummary);

// Writes the order as a WhatsApp message and adds a button that opens it
function showWhatsAppButton(message) {
  const old = document.getElementById('waOrderBtn');
  if (old) old.remove();

  const digits = String(settings.whatsapp).replace(/\D/g, '');
  if (!digits) return;

  const link = document.createElement('a');
  link.id = 'waOrderBtn';
  link.className = 'wa-btn';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Send my order on WhatsApp';
  link.href = 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message);
  link.style.display = 'block';
  link.style.textAlign = 'center';
  link.style.margin = '0 0 12px';

  document.getElementById('doneText').after(link);
}

document.getElementById('checkoutForm').addEventListener('submit', async function (event) {
  event.preventDefault(); // stop the page from reloading

  const submitBtn = event.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Placing order...';

  const isDelivery = selectedFulfillment() === 'delivery';
  const payment = selectedPayment();
  const area = isDelivery && areas.length ? selectedArea() : null;
  const fee = isDelivery ? deliveryFee() : 0;
  const total = cartTotal() + fee;
  const customerName = document.getElementById('fullName').value.trim();
  const customerPhone = document.getElementById('phone').value.trim();
  const customerAddress = addressInput.value.trim();
  const note = document.getElementById('orderNote').value.trim();

  // Only the product and the quantity are sent. The database works out the prices.
  // The lines are also kept to write the WhatsApp message.
  const items = [];
  const messageLines = [];
  for (const id in cart) {
    const product = findProduct(id);
    if (product && product.available) {
      items.push({ product_id: product.id, quantity: cart[id] });
      messageLines.push('- ' + qtyLabel(product, cart[id]) + ' × ' + product.name +
        ' (' + formatPrice(product.price) + ' ' + product.unit + ')');
    }
  }

  const { data: orderNumber, error } = await db.rpc('place_order', {
    p_name: customerName,
    p_phone: customerPhone,
    p_fulfillment: selectedFulfillment(),
    p_address: isDelivery ? customerAddress : '',
    p_payment: payment,
    p_items: items,
    p_note: note,
    p_area: area ? area.name : ''
  });

  submitBtn.disabled = false;
  submitBtn.textContent = 'Place order';

  if (error) {
    alert('Could not place your order: ' + error.message);
    return;
  }

  let doneText =
    'Thank you, ' + customerName + '! Your order number is ' + orderNumber +
    '. Total: ' + formatPrice(total) + '. ' +
    (isDelivery ? 'We will deliver to your address.' : 'Please pick it up at the shop.');

  if (payment === 'transfer') {
    doneText += ' Please transfer ' + formatPrice(total) + ' to ' + settings.bankName +
      ', account ' + settings.accountNumber + ' (' + settings.accountName + ')' +
      ' and use ' + orderNumber + ' as the reference. Then send your payment proof on WhatsApp.';
  }

  doneText += ' You can follow this order any time in My account.';
  document.getElementById('doneText').textContent = doneText;

  const message =
    'New order ' + orderNumber + '\n' +
    'Name: ' + customerName + '\n' +
    'Phone: ' + customerPhone + '\n' +
    (isDelivery
      ? 'Delivery to: ' + customerAddress + (area ? ' (' + area.name + ')' : '')
      : 'Pickup at the shop') + '\n' +
    'Items:\n' + messageLines.join('\n') + '\n' +
    (note ? 'Note: ' + note + '\n' : '') +
    'Delivery fee: ' + formatPrice(fee) + '\n' +
    'Total: ' + formatPrice(total) + '\n' +
    'Payment: ' + (payment === 'transfer'
      ? 'Bank transfer (I will send my payment proof)'
      : 'Pay on delivery / at pickup');

  showWhatsAppButton(message);

  cart = {};
  saveCart();
  renderCart();
  document.getElementById('checkoutForm').reset();

  checkoutModal.classList.add('hidden');
  document.getElementById('doneModal').classList.remove('hidden');
});

document.getElementById('doneBtn').addEventListener('click', function () {
  document.getElementById('doneModal').classList.add('hidden');
});

// ---------- FOOTER (contact details come from Admin > Settings) ----------
function addFooterLine(footer, text) {
  const p = document.createElement('p');
  p.textContent = text;
  footer.appendChild(p);
}

function renderFooter() {
  const footer = document.getElementById('shopFooter');
  footer.innerHTML = '';

  const brand = document.createElement('p');
  brand.className = 'foot-name';
  brand.textContent = 'Madalla Ice Products and Suya Spot';
  footer.appendChild(brand);

  if (settings.address) addFooterLine(footer, 'Address: ' + settings.address);
  if (settings.hours) addFooterLine(footer, 'Open: ' + settings.hours);
  if (settings.phone) addFooterLine(footer, 'Phone: ' + settings.phone);

  const digits = String(settings.whatsapp).replace(/\D/g, '');
  if (digits) {
    const link = document.createElement('a');
    link.className = 'wa-btn';
    link.href = 'https://wa.me/' + digits;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Chat on WhatsApp';
    footer.appendChild(link);
  }
}

// ---------- LOAD PRODUCTS FROM THE DATABASE ----------
async function loadProductsFromDb() {
  const { data, error } = await db
    .from('products')
    .select('id, name, unit, price, image_url, is_available, categories(name)')
    .order('id');

  if (error) {
    document.getElementById('menu').textContent = 'Could not load products: ' + error.message;
    return [];
  }

  // Convert database rows into the shape the rest of the page uses
  return data.map(function (row) {
    return {
      id: row.id,
      category: row.categories ? row.categories.name : 'Other',
      name: row.name,
      unit: row.unit,
      price: Number(row.price),
      image: row.image_url || '',
      available: row.is_available
    };
  });
}

// ---------- LOAD DELIVERY AREAS FROM THE DATABASE ----------
async function loadAreasFromDb() {
  const { data } = await db
    .from('delivery_areas')
    .select('id, name, fee')
    .eq('is_active', true)
    .order('name');

  if (!data) return [];

  return data.map(function (row) {
    return { id: row.id, name: row.name, fee: Number(row.fee) };
  });
}

// ---------- LOAD SETTINGS FROM THE DATABASE ----------
async function loadSettingsFromDb() {
  const { data } = await db.from('settings').select('*').eq('id', 1).maybeSingle();
  if (!data) return;

  settings = {
    deliveryFee: Number(data.delivery_fee),
    phone: data.phone,
    whatsapp: data.whatsapp,
    address: data.address,
    hours: data.hours,
    logoUrl: data.logo_url || '',
    bankName: data.bank_name || '',
    accountNumber: data.account_number || '',
    accountName: data.account_name || ''
  };
}

// ---------- CUSTOMER LOGIN ----------
// Logged in: the top link becomes "My account" and checkout is filled in for them.
// Not logged in: the top link says "Log in" and the checkout button asks them to log in.
async function loadCustomer() {
  const { data } = await db.auth.getSession();
  const accountLink = document.getElementById('accountLink');
  const checkoutBtn = document.getElementById('checkoutBtn');

  if (!data.session) {
    accountLink.textContent = 'Log in';
    accountLink.href = 'login.html';
    checkoutBtn.textContent = 'Log in to checkout';
    return;
  }

  accountLink.textContent = 'My account';
  accountLink.href = 'account.html';
  checkoutBtn.textContent = 'Checkout';

  const { data: profile } = await db
    .from('profiles')
    .select('full_name, phone, address')
    .eq('id', data.session.user.id)
    .maybeSingle();

  customerProfile = profile || {};

  // Google accounts may not have a name in the profile yet
  const meta = data.session.user.user_metadata || {};
  if (!customerProfile.full_name) customerProfile.full_name = meta.full_name || meta.name || '';
}

// ---------- START ----------
async function start() {
  products = await loadProductsFromDb();
  await loadSettingsFromDb();
  areas = await loadAreasFromDb();
  renderAreaSelect();
  renderLogo();
  renderChips();
  renderMenu();
  renderCart();
  renderFooter();
  await loadCustomer();

  // Coming back from the login page: open checkout straight away
  if (new URLSearchParams(location.search).get('checkout') && customerProfile && cartCount() > 0) {
    history.replaceState(null, '', 'index.html');
    openCheckout();
  }
}

start();