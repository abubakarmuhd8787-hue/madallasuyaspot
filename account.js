(function () {
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

  function addLine(parent, text) {
    const p = document.createElement('p');
    p.textContent = text;
    parent.appendChild(p);
  }

  // ---------- LOG OUT ----------
  document.getElementById('logoutBtn').addEventListener('click', async function () {
    await db.auth.signOut();
    location.href = 'index.html';
  });

  // ---------- MY DETAILS ----------
  async function loadProfile(user) {
    const { data } = await db
      .from('profiles')
      .select('full_name, phone, address')
      .eq('id', user.id)
      .maybeSingle();

    const meta = user.user_metadata || {};
    document.getElementById('pName').value = (data && data.full_name) || meta.full_name || meta.name || '';
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
      list.textContent = 'You have no orders yet.';
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

  // ---------- START ----------
  (async function start() {
    const { data } = await db.auth.getSession();

    // Not logged in: go to the login page, then come back here
    if (!data.session) {
      location.href = 'login.html?next=account.html';
      return;
    }

    await loadProfile(data.session.user);
    await loadOrders(data.session.user);
  })();
})();
