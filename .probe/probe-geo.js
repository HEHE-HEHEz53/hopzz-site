/* 几何探针：真实 index.html + app.css + ai.js，375px 视口，检查创建按钮是否被遮挡 */
(function () {
  'use strict';

  function log(msg) {
    var el = document.getElementById('probe-log');
    if (el) el.textContent += msg + '\n';
  }

  function maxZUnder(el) {
    var stack = document.elementsFromPoint(el.x, el.y);
    return stack.map(function (n) {
      var cls = n.className ? ('.' + String(n.className).trim().replace(/\s+/g, '.')) : '';
      var id = n.id ? '#' + n.id : '';
      return n.tagName + id + cls;
    }).join(' <- ');
  }

  function run() {
    log('viewport=' + window.innerWidth + 'x' + window.innerHeight);
    log('errors(init)=' + JSON.stringify(window.__errors));
    log('scrollWidth=' + document.documentElement.scrollWidth + ' bodyScrollWidth=' + document.body.scrollWidth);

    var newBtn = document.getElementById('new-project-btn');
    log('newBtn=' + !!newBtn + ' rect=' + JSON.stringify(newBtn ? newBtn.getBoundingClientRect() : null));
    newBtn.click();

    setTimeout(function () {
      var root = document.getElementById('modal-root');
      log('--- modal: hidden=' + root.hidden);
      var okBtn = null;
      Array.prototype.forEach.call(root.querySelectorAll('.modal-actions button'), function (b) {
        if (b.className.indexOf('btn-primary') >= 0) okBtn = b;
      });
      if (!okBtn) { log('NO OK BUTTON'); finish(); return; }

      var nameInput = root.querySelector('input[type="text"]');
      if (nameInput) nameInput.value = '鲸落';

      var r = okBtn.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      log('okBtn rect=' + JSON.stringify({ left: r.left, top: r.top, width: r.width, height: r.height }));
      log('elementFromPoint(' + cx.toFixed(1) + ',' + cy.toFixed(1) + ')=' + (function () {
        var n = document.elementFromPoint(cx, cy);
        if (!n) return 'null';
        var cls = n.className ? ('.' + String(n.className).trim().replace(/\s+/g, '.')) : '';
        return n.tagName + (n.id ? '#' + n.id : '') + cls;
      }()));
      log('stack=' + maxZUnder({ x: cx, y: cy }));

      // 试试直接点击
      var evt = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy });
      var target = document.elementFromPoint(cx, cy);
      log('dispatching click at point on: ' + (target ? target.tagName : 'null'));
      if (target) target.dispatchEvent(evt);

      setTimeout(function () {
        log('--- after real click ---');
        log('calls=' + JSON.stringify(window.__calls));
        log('errors=' + JSON.stringify(window.__errors));
        log('modal hidden=' + root.hidden);
        var errEl = root.querySelector('.form-error');
        log('form-error=' + JSON.stringify(errEl ? errEl.textContent : '(node gone)'));
        finish();
      }, 500);
    }, 400);
  }

  function finish() {
    var el = document.createElement('div');
    el.id = 'probe-done';
    el.textContent = 'DONE';
    document.body.appendChild(el);
  }

  window.addEventListener('load', function () { setTimeout(run, 600); });
})();
