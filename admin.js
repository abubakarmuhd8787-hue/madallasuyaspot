let products = [];
let areas = [];
let riders = [];

// The public key for push notifications (safe to be here)
const VAPID_PUBLIC_KEY = 'BNdEBxyV0I09jkEqH1yjEu77ivbyc6z5_diG41E5pBUtaGNgySUT1dzw8p-dTYwCTlXkfqR1fRuN3aH_0K1NB9Q';

function flash(id, text) {
  const el = document.getElementById(id);
  el.textContent = text;
  setTimeout(function () { el.textContent = ''; }, 4000);
}

const loginBox = document.getElementById('loginBox');
const dashboard = document.getElementById('dashboard');
const logoutBtn = document.getElementById('logoutBtn');

// ---------- LOGIN ----------
async function isAdmin(userId) {
  const { data } = await db
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  return !!data && data.role === 'admin';
}

let dashboardStarted = false;

async function showDashboard() {
  if (dashboardStarted) return;
  dashboardStarted = true;

  loginBox.classList.add('hidden');
  dashboard.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
  createOrderAlert();
  await loadProductsAdmin();
  await loadSettingsAdmin();
  await loadAreasAdmin();
  await loadRidersAdmin();
  await loadOrdersAdmin();
  refreshPushStatus();
  setInterval(checkNewOrders, 20000); // look for new orders every 20 seconds

  // Opened from a notification: go straight to the Orders tab
  if (new URLSearchParams(location.search).get('tab') === 'orders') {
    document.querySelector('.tab[data-tab="ordersTab"]').click();
  }
}

document.getElementById('loginForm').addEventListener('submit', async function (event) {
  event.preventDefault();
  const errorBox = document.getElementById('loginError');
  errorBox.textContent = '';

  const { data, error } = await db.auth.signInWithPassword({
    email: document.getElementById('email').value.trim(),
    password: document.getElementById('password').value
  });

  if (error) {
    errorBox.textContent = 'Login failed: ' + error.message;
    return;
  }

  if (!(await isAdmin(data.user.id))) {
    await db.auth.signOut();
    errorBox.textContent = 'This account is not an admin.';
    return;
  }

  showDashboard();
});

logoutBtn.addEventListener('click', async function () {
  await db.auth.signOut();
  location.reload();
});

// ---------- TABS ----------
document.querySelectorAll('.tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    tab.classList.add('active');
    ['productsTab', 'ordersTab', 'deliveryTab', 'settingsTab'].forEach(function (id) {
      document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(tab.dataset.tab).classList.remove('hidden');

    if (tab.dataset.tab === 'ordersTab') clearOrderAlert();
  });
});

// ---------- PHONE NOTIFICATIONS ----------
const pushOnBtn = document.getElementById('pushOn');
const pushOffBtn = document.getElementById('pushOff');

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Turns the public key into the form the browser needs
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

async function refreshPushStatus() {
  const status = document.getElementById('pushStatus');

  if (!pushSupported()) {
    status.textContent = 'This browser cannot show push notifications. On an iPhone, add this site to your Home Screen (Share > Add to Home Screen) and open it from there.';
    pushOnBtn.classList.add('hidden');
    pushOffBtn.classList.add('hidden');
    return;
  }

  if (Notification.permission === 'denied') {
    status.textContent = 'Notifications are blocked for this site. Allow them in your browser settings (tap the lock icon next to the address), then reload this page.';
    pushOnBtn.classList.add('hidden');
    pushOffBtn.classList.add('hidden');
    return;
  }

  const sub = await currentSubscription();

  if (sub && Notification.permission === 'granted') {
    status.textContent = 'Notifications are ON for this device. You will be alerted for every new order, even when this page is closed.';
    pushOnBtn.classList.add('hidden');
    pushOffBtn.classList.remove('hidden');
  } else {
    status.textContent = 'Notifications are OFF on this device. Turn them on to be alerted about new orders even when this page is closed.';
    pushOnBtn.classList.remove('hidden');
    pushOffBtn.classList.add('hidden');
  }
}

async function enablePush() {
  const registration = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('You did not allow notifications.');
  }

  let sub = await registration.pushManager.getSubscription();
  if (!sub) {
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
  }

  const json = sub.toJSON();
  const { data } = await db.auth.getSession();

  const { error } = await db.from('push_subscriptions').upsert({
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_id: data.session.user.id
  }, { onConflict: 'endpoint' });

  if (error) throw error;
}

async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;

  await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

pushOnBtn.addEventListener('click', async function () {
  pushOnBtn.disabled = true;
  try {
    await enablePush();
    flash('pushMsg', 'Notifications are on.');
  } catch (e) {
    flash('pushMsg', 'Could not turn on notifications: ' + e.message);
  }
  pushOnBtn.disabled = false;
  refreshPushStatus();
});

pushOffBtn.addEventListener('click', async function () {
  try {
    await disablePush();
    flash('pushMsg', 'Notifications are off on this device.');
  } catch (e) {
    flash('pushMsg', 'Could not turn off: ' + e.message);
  }
  refreshPushStatus();
});

// ---------- IMAGE UPLOAD ----------
// Shrinks the picture first, so phone photos don't make the shop slow to load
function resizeImage(file, maxSize, type, quality) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = function () {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      if (type === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);

      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('Could not process the image'));
      }, type, quality);
    };

    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error('That file is not a valid image'));
    };

    img.src = url;
  });
}

async function uploadImage(file, folder, maxSize, type) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file');
  }

  const blob = await resizeImage(file, maxSize, type, 0.85);
  const ext = type === 'image/png' ? 'png' : 'jpg';
  const path = folder + '/' + Date.now() + '-' + Math.floor(Math.random() * 100000) + '.' + ext;

  const { error } = await db.storage
    .from('shop-images')
    .upload(path, blob, { contentType: type, cacheControl: '31536000' });
  if (error) throw error;

  return db.storage.from('shop-images').getPublicUrl(path).data.publicUrl;
}

// ---------- PRODUCTS ----------
async function loadProductsAdmin() {
  const { data, error } = await db
    .from('products')
    .select('id, name, unit, price, image_url, is_available, categories(name)')
    .order('id');

  if (error) {
    document.getElementById('productList').textContent = 'Could not load products: ' + error.message;
    return;
  }

  products = data.map(function (row) {
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

  drawProducts();
  fillCategoryList();
}

function makeInput(type, value, placeholder, onChange) {
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  if (type === 'number') input.min = '0';
  input.addEventListener('input', function () { onChange(input.value); });
  return input;
}

function makeCheck(label, checked, onChange) {
  const checkLabel = document.createElement('label');
  checkLabel.className = 'check';
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = checked;
  check.addEventListener('change', function () { onChange(check.checked); });
  checkLabel.appendChild(check);
  checkLabel.appendChild(document.createTextNode(label));
  return checkLabel;
}

async function saveProductImage(product, url) {
  const { error } = await db
    .from('products')
    .update({ image_url: url || null })
    .eq('id', product.id);
  if (error) throw error;
  product.image = url;
}

function drawProducts() {
  const list = document.getElementById('productList');
  list.innerHTML = '';

  if (products.length === 0) {
    list.textContent = 'No products yet. Add one below.';
    return;
  }

  products.forEach(function (product) {
    const row = document.createElement('div');
    row.className = 'admin-row';

    // Name and category
    const top = document.createElement('div');
    top.className = 'row-top';
    top.appendChild(makeInput('text', product.name, 'Name', function (v) { product.name = v; }));
    const cat = document.createElement('span');
    cat.className = 'cat';
    cat.textContent = product.category;
    top.appendChild(cat);

    // Photo: preview, upload and remove
    const photoBox = document.createElement('div');
    photoBox.className = 'photo-box';

    if (product.image) {
      const thumb = document.createElement('img');
      thumb.className = 'thumb';
      thumb.src = product.image;
      thumb.alt = product.name;
      photoBox.appendChild(thumb);
    } else {
      const empty = document.createElement('div');
      empty.className = 'thumb empty';
      empty.textContent = 'No photo';
      photoBox.appendChild(empty);
    }

    const uploadLabel = document.createElement('label');
    uploadLabel.className = 'upload-btn';
    uploadLabel.appendChild(document.createTextNode(product.image ? 'Change photo' : 'Upload photo'));
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;
    fileInput.addEventListener('change', async function () {
      const file = fileInput.files[0];
      if (!file) return;
      flash('saveMsg', 'Uploading photo...');
      try {
        const url = await uploadImage(file, 'products', 900, 'image/jpeg');
        await saveProductImage(product, url);
        drawProducts();
        flash('saveMsg', 'Photo saved for ' + product.name + '.');
      } catch (e) {
        flash('saveMsg', 'Could not upload: ' + e.message);
      }
    });
    uploadLabel.appendChild(fileInput);
    photoBox.appendChild(uploadLabel);

    if (product.image) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'danger small-btn';
      removeBtn.textContent = 'Remove photo';
      removeBtn.addEventListener('click', async function () {
        try {
          await saveProductImage(product, '');
          drawProducts();
          flash('saveMsg', 'Photo removed.');
        } catch (e) {
          flash('saveMsg', 'Could not remove: ' + e.message);
        }
      });
      photoBox.appendChild(removeBtn);
    }

    // Unit, price, availability, delete
    const unit = makeInput('text', product.unit, 'Unit', function (v) { product.unit = v; });
    unit.className = 'small';

    const price = makeInput('number', product.price, 'Price', function (v) { product.price = Number(v) || 0; });
    price.className = 'small';

    const del = document.createElement('button');
    del.className = 'danger small-btn';
    del.textContent = 'Delete';
    del.addEventListener('click', async function () {
      if (!confirm('Delete ' + product.name + '?')) return;
      const { error } = await db.from('products').delete().eq('id', product.id);
      if (error) {
        flash('saveMsg', 'Could not delete: ' + error.message);
        return;
      }
      await loadProductsAdmin();
    });

    row.appendChild(top);
    row.appendChild(photoBox);
    row.appendChild(unit);
    row.appendChild(price);
    row.appendChild(makeCheck('Available', product.available, function (v) { product.available = v; }));
    row.appendChild(del);
    list.appendChild(row);
  });
}

function fillCategoryList() {
  const list = document.getElementById('categoryList');
  list.innerHTML = '';
  const seen = [];
  products.forEach(function (p) {
    if (!seen.includes(p.category)) {
      seen.push(p.category);
      const option = document.createElement('option');
      option.value = p.category;
      list.appendChild(option);
    }
  });
}

document.getElementById('saveProducts').addEventListener('click', async function () {
  const results = await Promise.all(products.map(function (p) {
    return db.from('products').update({
      name: p.name,
      unit: p.unit,
      price: p.price,
      is_available: p.available,
      updated_at: new Date().toISOString()
    }).eq('id', p.id);
  }));

  const failed = results.find(function (r) { return r.error; });
  if (failed) {
    flash('saveMsg', 'Could not save: ' + failed.error.message);
  } else {
    flash('saveMsg', 'Saved. The shop now shows these changes.');
  }
});

// Find a category by name, or create it
async function getCategoryId(name) {
  const found = await db.from('categories').select('id').eq('name', name).maybeSingle();
  if (found.data) return found.data.id;

  const created = await db.from('categories').insert({ name: name }).select('id').single();
  if (created.error) throw created.error;
  return created.data.id;
}

document.getElementById('addForm').addEventListener('submit', async function (event) {
  event.preventDefault();
  const form = event.target;

  try {
    const categoryId = await getCategoryId(document.getElementById('newCategory').value.trim());

    const { error } = await db.from('products').insert({
      category_id: categoryId,
      name: document.getElementById('newName').value.trim(),
      unit: document.getElementById('newUnit').value.trim(),
      price: Number(document.getElementById('newPrice').value) || 0,
      is_available: true
    });
    if (error) throw error;

    form.reset();
    flash('addMsg', 'Product added. Upload its photo in the list above.');
    await loadProductsAdmin();
  } catch (e) {
    flash('addMsg', 'Could not add: ' + e.message);
  }
});

// ---------- DELIVERY AREAS ----------
async function loadAreasAdmin() {
  const { data, error } = await db
    .from('delivery_areas')
    .select('*')
    .order('name');

  if (error) {
    document.getElementById('areaList').textContent = 'Could not load areas: ' + error.message;
    return;
  }

  areas = data.map(function (row) {
    return { id: row.id, name: row.name, fee: Number(row.fee), active: row.is_active };
  });
  drawAreas();
}

function drawAreas() {
  const list = document.getElementById('areaList');
  list.innerHTML = '';

  if (areas.length === 0) {
    list.textContent = 'No areas yet. The single delivery fee from Settings is used.';
    return;
  }

  areas.forEach(function (area) {
    const row = document.createElement('div');
    row.className = 'admin-row';

    const top = document.createElement('div');
    top.className = 'row-top';
    top.appendChild(makeInput('text', area.name, 'Area name', function (v) { area.name = v; }));
    row.appendChild(top);

    const fee = makeInput('number', area.fee, 'Fee', function (v) { area.fee = Number(v) || 0; });
    fee.className = 'small';
    row.appendChild(fee);

    row.appendChild(makeCheck('Active', area.active, function (v) { area.active = v; }));

    const del = document.createElement('button');
    del.className = 'danger small-btn';
    del.textContent = 'Delete';
    del.addEventListener('click', async function () {
      if (!confirm('Delete the area ' + area.name + '?')) return;
      const { error } = await db.from('delivery_areas').delete().eq('id', area.id);
      if (error) {
        flash('areaMsg', 'Could not delete: ' + error.message);
        return;
      }
      await loadAreasAdmin();
    });
    row.appendChild(del);

    list.appendChild(row);
  });
}

document.getElementById('saveAreas').addEventListener('click', async function () {
  const results = await Promise.all(areas.map(function (a) {
    return db.from('delivery_areas').update({
      name: a.name.trim(),
      fee: a.fee,
      is_active: a.active
    }).eq('id', a.id);
  }));

  const failed = results.find(function (r) { return r.error; });
  flash('areaMsg', failed ? 'Could not save: ' + failed.error.message : 'Areas saved.');
});

document.getElementById('areaForm').addEventListener('submit', async function (event) {
  event.preventDefault();
  const form = event.target;

  const { error } = await db.from('delivery_areas').insert({
    name: document.getElementById('newAreaName').value.trim(),
    fee: Number(document.getElementById('newAreaFee').value) || 0
  });

  if (error) {
    flash('areaMsg', 'Could not add: ' + error.message);
    return;
  }

  form.reset();
  flash('areaMsg', 'Area added.');
  await loadAreasAdmin();
});

// ---------- RIDERS ----------
async function loadRidersAdmin() {
  const { data, error } = await db
    .from('riders')
    .select('*')
    .order('name');

  if (error) {
    document.getElementById('riderList').textContent = 'Could not load riders: ' + error.message;
    return;
  }

  riders = data.map(function (row) {
    return { id: row.id, name: row.name, phone: row.phone, active: row.is_active };
  });
  drawRiders();
}

function drawRiders() {
  const list = document.getElementById('riderList');
  list.innerHTML = '';

  if (riders.length === 0) {
    list.textContent = 'No riders yet.';
    return;
  }

  riders.forEach(function (rider) {
    const row = document.createElement('div');
    row.className = 'admin-row';

    const top = document.createElement('div');
    top.className = 'row-top';
    top.appendChild(makeInput('text', rider.name, 'Rider name', function (v) { rider.name = v; }));
    row.appendChild(top);

    const phone = makeInput('text', rider.phone, 'Phone', function (v) { rider.phone = v; });
    phone.className = 'small';
    row.appendChild(phone);

    row.appendChild(makeCheck('Active', rider.active, function (v) { rider.active = v; }));

    const del = document.createElement('button');
    del.className = 'danger small-btn';
    del.textContent = 'Delete';
    del.addEventListener('click', async function () {
      if (!confirm('Delete the rider ' + rider.name + '?')) return;
      const { error } = await db.from('riders').delete().eq('id', rider.id);
      if (error) {
        flash('riderMsg', 'Could not delete: ' + error.message);
        return;
      }
      await loadRidersAdmin();
      await loadOrdersAdmin();
    });
    row.appendChild(del);

    list.appendChild(row);
  });
}

document.getElementById('saveRiders').addEventListener('click', async function () {
  const results = await Promise.all(riders.map(function (r) {
    return db.from('riders').update({
      name: r.name.trim(),
      phone: r.phone.trim(),
      is_active: r.active
    }).eq('id', r.id);
  }));

  const failed = results.find(function (r) { return r.error; });
  flash('riderMsg', failed ? 'Could not save: ' + failed.error.message : 'Riders saved.');
  if (!failed) loadOrdersAdmin();
});

document.getElementById('riderForm').addEventListener('submit', async function (event) {
  event.preventDefault();
  const form = event.target;

  const { error } = await db.from('riders').insert({
    name: document.getElementById('newRiderName').value.trim(),
    phone: document.getElementById('newRiderPhone').value.trim()
  });

  if (error) {
    flash('riderMsg', 'Could not add: ' + error.message);
    return;
  }

  form.reset();
  flash('riderMsg', 'Rider added.');
  await loadRidersAdmin();
  await loadOrdersAdmin();
});

// ---------- SETTINGS ----------
function showLogoPreview(url) {
  const preview = document.getElementById('logoPreview');
  const none = document.getElementById('logoNone');
  const removeBtn = document.getElementById('removeLogo');

  if (url) {
    preview.src = url;
    preview.classList.remove('hidden');
    none.classList.add('hidden');
    removeBtn.classList.remove('hidden');
  } else {
    preview.classList.add('hidden');
    none.classList.remove('hidden');
    removeBtn.classList.add('hidden');
  }
}

function showHeroPreview(url) {
  const preview = document.getElementById('heroPreview');
  const none = document.getElementById('heroNone');
  const removeBtn = document.getElementById('removeHero');

  if (url) {
    preview.src = url;
    preview.classList.remove('hidden');
    none.classList.add('hidden');
    removeBtn.classList.remove('hidden');
  } else {
    preview.classList.add('hidden');
    none.classList.remove('hidden');
    removeBtn.classList.add('hidden');
  }
}

async function loadSettingsAdmin() {
  const { data } = await db.from('settings').select('*').eq('id', 1).maybeSingle();
  if (!data) return;
  document.getElementById('sDeliveryFee').value = data.delivery_fee;
  document.getElementById('sPhone').value = data.phone;
  document.getElementById('sWhatsapp').value = data.whatsapp;
  document.getElementById('sAddress').value = data.address;
  document.getElementById('sHours').value = data.hours;
  document.getElementById('sBankName').value = data.bank_name || '';
  document.getElementById('sAccountNumber').value = data.account_number || '';
  document.getElementById('sAccountName').value = data.account_name || '';
  showLogoPreview(data.logo_url);
  showHeroPreview(data.hero_image_url);
}

document.getElementById('settingsForm').addEventListener('submit', async function (event) {
  event.preventDefault();

  const { error } = await db.from('settings').update({
    delivery_fee: Number(document.getElementById('sDeliveryFee').value) || 0,
    phone: document.getElementById('sPhone').value.trim(),
    whatsapp: document.getElementById('sWhatsapp').value.trim(),
    address: document.getElementById('sAddress').value.trim(),
    hours: document.getElementById('sHours').value.trim(),
    bank_name: document.getElementById('sBankName').value.trim(),
    account_number: document.getElementById('sAccountNumber').value.trim(),
    account_name: document.getElementById('sAccountName').value.trim()
  }).eq('id', 1);

  flash('settingsMsg', error ? 'Could not save: ' + error.message : 'Settings saved.');
});

document.getElementById('logoFile').addEventListener('change', async function (event) {
  const file = event.target.files[0];
  if (!file) return;

  flash('logoMsg', 'Uploading logo...');
  try {
    const url = await uploadImage(file, 'logo', 400, 'image/png');
    const { error } = await db.from('settings').update({ logo_url: url }).eq('id', 1);
    if (error) throw error;
    showLogoPreview(url);
    flash('logoMsg', 'Logo saved. The shop now shows it.');
  } catch (e) {
    flash('logoMsg', 'Could not upload: ' + e.message);
  }
  event.target.value = '';
});

document.getElementById('removeLogo').addEventListener('click', async function () {
  const { error } = await db.from('settings').update({ logo_url: '' }).eq('id', 1);
  if (error) {
    flash('logoMsg', 'Could not remove: ' + error.message);
    return;
  }
  showLogoPreview('');
  flash('logoMsg', 'Logo removed.');
});

// Banner photo for the top of the shop page
document.getElementById('heroFile').addEventListener('change', async function (event) {
  const file = event.target.files[0];
  if (!file) return;

  flash('heroMsg', 'Uploading banner photo...');
  try {
    const url = await uploadImage(file, 'banner', 1600, 'image/jpeg');
    const { error } = await db.from('settings').update({ hero_image_url: url }).eq('id', 1);
    if (error) throw error;
    showHeroPreview(url);
    flash('heroMsg', 'Banner photo saved. The shop now shows it.');
  } catch (e) {
    flash('heroMsg', 'Could not upload: ' + e.message);
  }
  event.target.value = '';
});

document.getElementById('removeHero').addEventListener('click', async function () {
  const { error } = await db.from('settings').update({ hero_image_url: '' }).eq('id', 1);
  if (error) {
    flash('heroMsg', 'Could not remove: ' + error.message);
    return;
  }
  showHeroPreview('');
  flash('heroMsg', 'Banner photo removed.');
});

// ---------- NEW ORDER ALERTS (while this page is open) ----------
const PAGE_TITLE = document.title;
let lastOrderId = null;
let alertBanner = null;

function beep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.25;
    osc.start();
    setTimeout(function () { osc.stop(); ctx.close(); }, 700);
  } catch (e) {}
}

function createOrderAlert() {
  alertBanner = document.createElement('div');
  alertBanner.className = 'hidden';
  alertBanner.style.cssText =
    'background:#1d4ed8;color:#fff;padding:12px;border-radius:8px;' +
    'margin:12px 0;font-weight:700;text-align:center;cursor:pointer;';
  alertBanner.textContent = '🔔 New order received. Tap to view.';
  alertBanner.addEventListener('click', function () {
    document.querySelector('.tab[data-tab="ordersTab"]').click();
  });
  dashboard.insertBefore(alertBanner, dashboard.firstChild);
}

function showOrderAlert() {
  alertBanner.classList.remove('hidden');
  document.title = '🔔 New order! - Madalla';
  beep();
}

function clearOrderAlert() {
  if (alertBanner) alertBanner.classList.add('hidden');
  document.title = PAGE_TITLE;
}

window.addEventListener('focus', function () {
  document.title = alertBanner && !alertBanner.classList.contains('hidden')
    ? '🔔 New order! - Madalla'
    : PAGE_TITLE;
});

async function checkNewOrders() {
  const { data } = await db
    .from('orders')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);

  if (!data) return;

  const newest = data.length ? data[0].id : 0;
  if (lastOrderId !== null && newest > lastOrderId) {
    await loadOrdersAdmin();
    showOrderAlert();
  }
}

// ---------- ORDERS ----------
const ORDER_STATUSES = {
  delivery: [
    ['placed', 'Placed'],
    ['preparing', 'Preparing'],
    ['out_for_delivery', 'Out for delivery'],
    ['completed', 'Delivered'],
    ['cancelled', 'Cancelled']
  ],
  pickup: [
    ['placed', 'Placed'],
    ['preparing', 'Preparing'],
    ['ready_for_pickup', 'Ready for pickup'],
    ['completed', 'Picked up'],
    ['cancelled', 'Cancelled']
  ]
};

const PAYMENT_STATUSES = [
  ['pending', 'Not paid yet'],
  ['paid', 'Paid'],
  ['failed', 'Failed']
];

const PAYMENT_METHODS = {
  pay_on_delivery: 'Pay on delivery / at pickup',
  transfer: 'Bank transfer',
  online: 'Online'
};

function qtyText(item) {
  return /kg/i.test(item.unit || '') ? item.quantity + ' kg' : String(item.quantity);
}

// Turns 08012345678 into 2348012345678 so WhatsApp can open it
function toWaNumber(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '234' + digits.slice(1);
  return digits;
}

// The order, written as a WhatsApp message for the rider
function riderMessage(order) {
  const lines = order.order_items.map(function (item) {
    return '- ' + qtyText(item) + ' × ' + item.product_name;
  });

  const unpaid = order.payment_status !== 'paid';

  return 'Delivery order ' + order.order_number + '\n' +
    'Customer: ' + order.customer_name + '\n' +
    'Phone: ' + order.customer_phone + '\n' +
    'Address: ' + order.delivery_address + (order.delivery_area ? ' (' + order.delivery_area + ')' : '') + '\n' +
    'Items:\n' + lines.join('\n') + '\n' +
    (order.note ? 'Note: ' + order.note + '\n' : '') +
    (unpaid ? 'Collect cash: ' + formatPrice(order.total) : 'Already paid. Do not collect money.');
}

// A drop-down list that saves the new value to the order when changed
function makeSelect(options, current, orderId, column, after) {
  const select = document.createElement('select');
  options.forEach(function (option) {
    const el = document.createElement('option');
    el.value = option[0];
    el.textContent = option[1];
    if (option[0] === current) el.selected = true;
    select.appendChild(el);
  });

  select.addEventListener('change', async function () {
    const changes = {};
    if (column === 'rider_id') {
      changes[column] = select.value === '' ? null : Number(select.value);
    } else {
      changes[column] = select.value;
    }

    const { error } = await db.from('orders').update(changes).eq('id', orderId);

    if (error) {
      alert('Could not save the change: ' + error.message);
      loadOrdersAdmin();
      return;
    }
    if (after) after();
  });

  return select;
}

function addCaption(parent, text) {
  const p = document.createElement('p');
  p.className = 'hint';
  p.textContent = text;
  parent.appendChild(p);
}

function riderOptions(order) {
  const options = [['', 'No rider yet']];
  riders.forEach(function (rider) {
    if (rider.active || rider.id === order.rider_id) {
      options.push([String(rider.id), rider.name + (rider.active ? '' : ' (not active)')]);
    }
  });
  return options;
}

async function loadOrdersAdmin() {
  const list = document.getElementById('orderList');

  const { data, error } = await db
    .from('orders')
    .select('*, order_items(*)')
    .order('id', { ascending: false });

  if (error) {
    list.textContent = 'Could not load orders: ' + error.message;
    return;
  }

  lastOrderId = data.length ? data[0].id : 0;
  list.innerHTML = '';

  if (data.length === 0) {
    list.textContent = 'No orders yet.';
    return;
  }

  data.forEach(function (order) {
    const box = document.createElement('div');
    box.className = 'order-box';

    const title = document.createElement('h3');
    title.textContent = order.order_number + ' · ' + order.customer_name;
    box.appendChild(title);

    const lines = [
      new Date(order.created_at).toLocaleString('en-NG'),
      'Phone: ' + order.customer_phone,
      order.fulfillment_type === 'delivery'
        ? 'Delivery to: ' + order.delivery_address + (order.delivery_area ? ' (' + order.delivery_area + ')' : '')
        : 'Pickup at the shop',
      'Payment method: ' + (PAYMENT_METHODS[order.payment_method] || order.payment_method)
    ];

    order.order_items.forEach(function (item) {
      lines.push(qtyText(item) + ' × ' + item.product_name + ' (' + formatPrice(item.unit_price) + ' ' + (item.unit || '') + ')');
    });

    if (order.note) lines.push('Note: ' + order.note);

    lines.push('Delivery fee: ' + formatPrice(order.delivery_fee));
    lines.push('Total: ' + formatPrice(order.total));

    lines.forEach(function (text) {
      const p = document.createElement('p');
      p.textContent = text;
      box.appendChild(p);
    });

    addCaption(box, 'Order status');
    box.appendChild(makeSelect(ORDER_STATUSES[order.fulfillment_type], order.status, order.id, 'status'));

    addCaption(box, 'Payment status');
    box.appendChild(makeSelect(PAYMENT_STATUSES, order.payment_status, order.id, 'payment_status'));

    // Rider (delivery orders only)
    if (order.fulfillment_type === 'delivery') {
      addCaption(box, 'Rider');
      box.appendChild(makeSelect(riderOptions(order), order.rider_id ? String(order.rider_id) : '', order.id, 'rider_id', loadOrdersAdmin));

      const rider = riders.find(function (r) { return r.id === order.rider_id; });
      if (rider && rider.phone) {
        const link = document.createElement('a');
        link.className = 'wa-btn';
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Message ' + rider.name + ' on WhatsApp';
        link.href = 'https://wa.me/' + toWaNumber(rider.phone) + '?text=' + encodeURIComponent(riderMessage(order));
        link.style.display = 'block';
        link.style.textAlign = 'center';
        link.style.marginTop = '10px';
        box.appendChild(link);
      }
    }

    list.appendChild(box);
  });
}

document.getElementById('refreshOrders').addEventListener('click', loadOrdersAdmin);

// ---------- START (stay logged in on refresh) ----------
(async function start() {
  const { data } = await db.auth.getSession();
  if (data.session && (await isAdmin(data.session.user.id))) {
    showDashboard();
  }
})();