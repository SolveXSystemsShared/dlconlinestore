/*
 * DLC service worker. It does one job: show an update from the store as a
 * notification and open the right page when it is tapped. It caches nothing,
 * so a deploy is never held back by an old copy of a page or script.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Down Low Cannabis';
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/favicon-32.png',
    tag: typeof data.tag === 'string' ? data.tag : 'dlc-update',
    data: { url: typeof data.url === 'string' ? data.url : '/account' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  // Same-site pages only, whatever the message said.
  let target = new URL('/account', self.location.origin);
  try {
    const wanted = new URL((event.notification.data && event.notification.data.url) || '/account', self.location.origin);
    if (wanted.origin === self.location.origin) target = wanted;
  } catch (e) {}
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of open) {
      if (new URL(client.url).origin === target.origin && 'focus' in client) {
        await client.focus();
        if ('navigate' in client) return client.navigate(target.href);
        return;
      }
    }
    return self.clients.openWindow(target.href);
  })());
});
