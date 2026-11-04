// ---------- DATA ----------
// readData, writeData, formatPrice and defaultSettings come from data.js
// "db" (the database connection) comes from config.js
let products = [];
let settings = Object.assign({}, defaultSettings);

// The cart is saved as { productId: quantity } so it survives a page refresh
let cart = readData('madallaCart', {});

let searchText = '';
let activeCategory = 'All';

function saveCart() {
  writeData('madallaCart', cart);
}

function deliveryFee() {
  return Number(settings.deliveryFee) || 0;
}

function findProduct(id) {
  return products.find(function (p) { return p.id === Number(id); });
}

function cartTotal() {
  let total = 0;
  for (const id in cart) {
    const product = findProduct(id);
    if (product && product.available) total += product.price * cart[id];
  }
  return total;
}

function cartCount() {
  let count = 0;
  for (const id in cart) {
    const product = findProduct(id);
    if (product && product.available) count += cart[id];
  }
  return count;
}

function addToCart(id) {
  cart[id] = (cart[id] || 0) + 1;
  saveCart();
  renderCart();
}

function changeQty(id, change) {
  cart[id] = (cart[id] || 0) + change;
  if (cart[id] <= 0) delete cart[id];
  saveCart();
  renderCart();
}

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
      card.className = p.available ? 'card' : 'card soldout';

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

        const btn = document.createElement('button');
        btn.className = 'primary add-btn';
        btn.textContent = 'Add to cart';
        btn.addEventListener('click', function () { addToCart(p.id); });

        card.appendChild(price);
        card.appendChild(btn);
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
    number.textContent = cart[id];

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

function selectedFulfillment() {
  return document.querySelector('input[name="fulfillment"]:checked').value;
}

function updateSummary() {
  const isDelivery = selectedFulfillment() === 'delivery';
  const fee = isDelivery ? deliveryFee() : 0;

  addressBox.classList.toggle('hidden', !isDelivery);
  addressInput.required = isDelivery;

  document.getElementById('sumItems').textContent = formatPrice(cartTotal());
  document.getElementById('sumFee').textContent = formatPrice(fee);
  document.getElementById('sumTotal').textContent = formatPrice(cartTotal() + fee);
}

document.getElementById('checkoutBtn').addEventListener('click', function () {
  cartPanel.classList.add('hidden');
  checkoutModal.classList.remove('hidden');
  updateSummary();
});

document.getElementById('closeCheckout').addEventListener('click', function () {
  checkoutModal.classList.add('hidden');
});

document.querySelectorAll('input[name="fulfillment"]').forEach(function (radio) {
  radio.addEventListener('change', updateSummary);
});

document.getElementById('checkoutForm').addEventListener('submit', async function (event) {
  event.preventDefault(); // stop the page from reloading

  const submitBtn = event.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Placing order...';

  const isDelivery = selectedFulfillment() === 'delivery';
  const fee = isDelivery ? deliveryFee() : 0;
  const total = cartTotal() + fee;
  const customerName = document.getElementById('fullName').value.trim();

  // Only the product and the quantity are sent. The database works out the prices.
  const items = [];
  for (const id in cart) {
    const product = findProduct(id);
    if (product && product.available) {
      items.push({ product_id: product.id, quantity: cart[id] });
    }
  }

  const { data: orderNumber, error } = await db.rpc('place_order', {
    p_name: customerName,
    p_phone: document.getElementById('phone').value.trim(),
    p_fulfillment: selectedFulfillment(),
    p_address: isDelivery ? addressInput.value.trim() : '',
    p_payment: document.querySelector('input[name="payment"]:checked').value,
    p_items: items
  });

  submitBtn.disabled = false;
  submitBtn.textContent = 'Place order';

  if (error) {
    alert('Could not place your order: ' + error.message);
    return;
  }

  document.getElementById('doneText').textContent =
    'Thank you, ' + customerName + '! Your order number is ' + orderNumber +
    '. Total: ' + formatPrice(total) + '. ' +
    (isDelivery ? 'We will deliver to your address.' : 'Please pick it up at the shop.') +
    ' Keep your order number to follow your order on the Track order page.';

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
    logoUrl: data.logo_url || ''
  };
}

// ---------- START ----------
async function start() {
  products = await loadProductsFromDb();
  await loadSettingsFromDb();
  renderLogo();
  renderChips();
  renderMenu();
  renderCart();
  renderFooter();
}

start();