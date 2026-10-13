'use strict';
(() => {
  const TEST_TAG = 'jiaben-icon-diagnostics-v2';
  const $ = id => document.getElementById(id);
  let output = '', registration;
  const imageUrl = name => new URL('./assets/icons/notifications/badge-' + name + '.png', location.href).href;
  function safePath(value) {
    if (!value) return '(未指定)';
    try {
      const u = new URL(value, location.href);
      return u.origin === location.origin ? u.pathname : '(非本站圖示)';
    } catch (_) { return '(圖示網址無法解析)'; }
  }
  async function getRegistration() {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) throw new Error('請用 Chrome 打開 GitHub Pages 的 HTTPS 網址。');
    const reg = await navigator.serviceWorker.getRegistration(new URL('./', location.href).href);
    if (!reg || !reg.active) throw new Error('還沒有可用的家本推播程式。請先打開家本首頁，再回到此頁。');
    registration = reg;
    return reg;
  }
  function workerVersion(worker) {
    return new Promise(resolve => {
      const channel = new MessageChannel();
      const done = value => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(value); };
      const timer = setTimeout(() => done('沒有版本回覆（可能仍是未加入診斷的版本；不是故障證明）'), 2500);
      channel.port1.onmessage = e => {
        const d = e.data;
        done(d && d.service === 'jiaben-notification-diagnostics' && d.version === 1 ? String(d.cache) : '回覆格式無法辨識');
      };
      try { worker.postMessage({type:'JIABEN_NOTIFICATION_DIAGNOSTICS'}, [channel.port2]); }
      catch (_) { done('無法讀到版本回覆'); }
    });
  }
  async function inspectImage(value) {
    if (!value) return '未指定';
    const url = new URL(value, location.href);
    const root = new URL('./assets/icons/', registration.scope).pathname;
    if (url.origin !== location.origin || !url.pathname.startsWith(root)) return '非家本圖示路徑，不讀取';
    url.search = '?jbIconCheck=v2'; url.hash = '';
    const res = await fetch(url.href, {cache:'no-store'});
    if (!res.ok) throw new Error('圖示載入失敗 HTTP ' + res.status);
    const bytes = await res.arrayBuffer();
    const bitmap = await createImageBitmap(new Blob([bytes], {type:'image/png'}));
    try {
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d', {willReadFrequently:true});
      if (!context) throw new Error('無法檢查圖示透明度');
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] === 0) transparent++;
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const sha = Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,'0')).join('');
      return bitmap.width + '×' + bitmap.height + '；透明 ' + (100 * transparent / (pixels.length / 4)).toFixed(1) + '%；SHA256 ' + sha;
    } finally { bitmap.close(); }
  }
  async function read() {
    const reg = await getRegistration();
    const brands = navigator.userAgentData && navigator.userAgentData.brands;
    const browser = brands ? brands.map(b => b.brand + ' ' + b.version).join(' / ') : '瀏覽器未提供版本資訊';
    const lines = ['家本通知圖示診斷 v2', '瀏覽器：' + browser, '通知權限：' + ('Notification' in window ? Notification.permission : '此瀏覽器不支援'), '實際執行 SW：' + await workerVersion(reg.active)];
    const notifications = await reg.getNotifications();
    lines.push('本站目前通知：' + notifications.length + ' 則');
    const inspected = new Map();
    for (let i = 0; i < notifications.length; i++) {
      const n = notifications[i];
      lines.push('通知 ' + (i+1) + (n.tag === TEST_TAG ? '（本頁測試）' : '（既有提醒）'));
      lines.push('  badge：' + safePath(n.badge));
      if (n.badge) {
        if (!inspected.has(n.badge)) inspected.set(n.badge, inspectImage(n.badge).catch(e=>e.message));
        lines.push('  badge 圖檔：' + await inspected.get(n.badge));
      }
      lines.push('  彩色 icon：' + safePath(n.icon));
      let page = '(未指定)';
      try { const value = new URL(n.data && n.data.url || './', reg.scope).searchParams.get('page'); page = /^(water|fast|pulse|home|cai|all|bal|rec|bud|stock|set)$/.test(value) ? value : '(其他或未指定)'; } catch (_) {}
      lines.push('  跳轉頁：' + page);
    }
    if (!notifications.length) lines.push('沒有通知可核對；可按下方的水滴測試。');
    output = lines.join('\n'); $('report').textContent = output;
    $('state').textContent = '診斷已讀取';
  }
  async function closeTests(reg) {
    for (const n of await reg.getNotifications({tag:TEST_TAG})) if (n.tag === TEST_TAG) n.close();
  }
  async function test(name) {
    const reg = await getRegistration();
    if (!('Notification' in window)) throw new Error('此瀏覽器不支援通知');
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('家本的通知權限尚未允許；請在 Chrome／家本的通知設定確認。');
    const badge = imageUrl(name);
    await inspectImage(badge);
    await closeTests(reg);
    await reg.showNotification('家本圖示測試・v2・' + (name === 'water' ? '水滴' : '書本'), {
      body:'這則直接指定透明 PNG，不經 GAS 或推播類型判斷。請鎖屏看小圖示。',
      icon:new URL('./assets/icons/app/icon-192.png', location.href).href,
      badge, tag:TEST_TAG, renotify:false, silent:true,
      data:{url:new URL('./notification-diagnostics.html',location.href).href}
    });
    await read(); $('state').textContent = '測試已送出，請鎖屏查看';
  }
  async function busy(id, label, action) {
    const button = $(id), original = button.textContent;
    const buttons = [...document.querySelectorAll('button')];
    buttons.forEach(b=>b.disabled=true); button.textContent=label; $('error').textContent='';
    try { await action(); }
    catch (e) { $('error').textContent=e.message || '操作未完成，請再試一次'; $('state').textContent='操作未完成'; }
    finally { button.textContent=original; buttons.forEach(b=>b.disabled=false); }
  }
  $('read').onclick=()=>busy('read','讀取中…',read);
  $('update').onclick=()=>busy('update','檢查中…',async()=>{
    const reg=await getRegistration(); await reg.update();
    await read(); $('state').textContent='已檢查更新；若有新版本，稍後再按重新讀取診斷確認。';
  });
  $('water').onclick=()=>busy('water','測試中…',()=>test('water'));
  $('book').onclick=()=>busy('book','測試中…',()=>test('book'));
  $('close').onclick=()=>busy('close','清除中…',async()=>{await closeTests(await getRegistration()); await read(); $('state').textContent='本頁的測試通知已清除';});
  $('copy').onclick=()=>busy('copy','複製中…',async()=>{
    if (!output) throw new Error('先重新讀取診斷');
    await navigator.clipboard.writeText(output); $('state').textContent='已複製診斷文字';
  });
  busy('read','讀取中…',read);
})();
