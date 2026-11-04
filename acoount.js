const authBox = document.getElementById('authBox');
const accountBox = document.getElementById('accountBox');
const logoutBtn = document.getElementById('logoutBtn');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');

const STATUS_NAMES = {
  placed: 'Placed',
  preparing: 'Preparing',
  out_for_delivery: 'Out for delivery',
  ready_for_pickup: 'Ready for pickup',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

const PAYMENT_STATUS_NAMES = {
  pending: 'Not paid yet',
  paid: 'Paid',
  failed: 'Failed'
};

function flash(id, text) {
  const el = document.getElementById(id);
  el.textContent = text;
  setTimeout(function () { el.textContent = ''; }, 4000);
}

function qtyText(item) {
  return /kg/i.test(item.unit || '') ? item.quantity + ' kg' : String(item.quantity);
}

// ---------- LOG IN / CREATE ACCOUNT SWITCH ----------
document.getElementById('showLogin').addEventListener('click', function () {
  document.getElementById('showLogin').classList.add('active');
  document.getElementById('showSignup').classList.remove('active');
  loginForm.classList.remove('hidden');
  signupForm.classList.add('hidden');
});

document.getElementById('showSignup').addEventListener('click', function () {
  document.getElementById('showSignup').classList.add('active');
  document.getElementById('showLogin').classList.remove('active');
  signupForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
});

// ---------- LOG IN ----------
loginForm.addEventListener('submit', async function (event) {
  event.preventDefault();
  document.getElementById('loginError').textContent = '';

  const { data, error } = await db.auth.signInWithPassword({
    email: document.getElementById('loginEmail').value.trim(),
    password: document.getElementById('loginPassword').value
  });

  if (error) {
    document.getElementById('loginError').textContent = 'Could not log in: ' + error.message;
    return;
  }

  showAccount(data.user);
});

// ---------- CREATE ACCOUNT ----------
signupForm.addEventListener('submit', async function (event) {
  event.preventDefault();
  const errorBox = document.getElementById('signupError');
  errorBox.textContent = '';

  const name = document.getElementById('signupName').value.trim();
  const phone = document.getElementById('signupPhone').value.trim();
  const digits = phone.replace(/\D/g, '');

  if (name.length < 2) {
    errorBox.textContent = 'Please enter your full name.';
    return;
  }
  if (digits.length < 10 || digits.length > 15) {
    errorBox.textContent = 'Please enter a valid phone number.';
    return;
  }

  const { data, error } = await db.auth.signUp({
    email: document.getElementById('signupEmail').value.trim(),
    password: document.getElementById('signupPassword').value,
    options: { data: { full_name: name, phone: phone } }
  });

  if (error) {
    errorBox.textContent = 'Could not create the account: ' + error.message;
    return;
  }

  if (data.session) {
    showAccount(data.user);
  } else {
    errorBox.textContent = 'Account created. Please check your email to confirm it, then log in.';
  }
});

// ---------- LOG OUT ----------
logoutBtn.addEventListener('click', async function () {
  await db.auth.signOut();
  location.reload();
});

// ---------- MY DETAILS ----------
async function loadProfile(user) {
  const { data } = await db
    .from('profiles')
    .select('full_name, phone, address')
    .eq('id', user.id)
    .maybeSingle();

  const meta = user.user_metadata || {};
  document.getElementById('pName').value = (data && data.full_name) || meta.full_name || '';
  document.getElementById('pPhone').value = (data && data.phone) || meta.phone || '';
  document.getElementById('pAddress').value = (data && data.address) || '';
}

document.getElementById('profileForm').addEventListener('submit', async function (event) {
  event.preventDefault();

  const { error } = await db.rpc('save_my_profile', {
    p_name: document.getElementById('pName').value,
    p_phone: document.getElementById('pPhone').value,
    p_address: document.getElementById('pAddress').value
  });

  flash('profileMsg', error ? 'Could not save: ' + error.message : 'Saved.');
});

// ---------- MY ORDERS ----------
function addLine(parent, text) {
  const p = document.createElement('p');
  p.textContent = text;
  parent.appendChild(p);
}

async function loadOrders(user) {
  const list = document.getElementById('orderList');
  list.textContent = 'Loading...';

  const { data, error } = await db
    .from('orders')
    .select('id, order_number, created_at, status, payment_status, total, fulfillment_type, order_items(product_name, quantity, unit)')
    .eq('user_id', user.id)
    .order('id', { ascending: false });

  if (error) {
    list.textContent = 'Could not load your orders: ' + error.message;
    return;
  }

  list.innerHTML = '';

  if (data.length === 0) {
    list.textContent = 'You have no orders yet. Orders you place while logged in will show here.';
    return;
  }

  data.forEach(function (order) {
    const box = document.createElement('div');
    box.className = 'order-box';

    const title = document.createElement('h3');
    title.textContent = order.order_number;
    box.appendChild(title);

    addLine(box, new Date(order.created_at).toLocaleString('en-NG'));

    order.order_items.forEach(function (item) {
      addLine(box, qtyText(item) + ' × ' + item.product_name);
    });

    addLine(box, (order.fulfillment_type === 'delivery' ? 'Delivery' : 'Pickup') +
      ' · Total: ' + formatPrice(order.total));
    addLine(box, 'Status: ' + (STATUS_NAMES[order.status] || order.status) +
      ' · ' + (PAYMENT_STATUS_NAMES[order.payment_status] || order.payment_status));

    const link = document.createElement('a');
    link.href = 'track.html?order=' + encodeURIComponent(order.order_number);
    link.textContent = 'Track this order';
    link.style.display = 'inline-block';
    link.style.marginTop = '6px';
    link.style.fontWeight = '700';
    box.appendChild(link);

    list.appendChild(box);
  });
}

// ---------- SHOW THE ACCOUNT ----------
async function showAccount(user) {
  authBox.classList.add('hidden');
  accountBox.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
  await loadProfile(user);
  await loadOrders(user);
}

// ---------- START (stay logged in on refresh) ----------
(async function start() {
  const { data } = await db.auth.getSession();
  if (data.session) showAccount(data.session.user);
})();