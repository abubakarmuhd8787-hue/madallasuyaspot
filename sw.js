// Madalla service worker: shows new-order notifications, even when the admin page is closed

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'New order', body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'New order', {
      body: data.body || '',
      tag: data.tag || 'madalla-order',
      data: { url: data.url || 'admin.html?tab=orders' }
    })
  );
});

// Tapping the notification opens the admin page on the Orders tab
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const target = new URL(
    (event.notification.data && event.notification.data.url) || 'admin.html?tab=orders',
    self.registration.scope
  ).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (const client of list) {
        if (client.url.indexOf('admin.html') !== -1 && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});