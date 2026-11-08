/* 流程探针：模拟「新建项目 → 填名字 → 点创建」 */
(function () {
  'use strict';

  function log(msg) {
    var el = document.getElementById('probe-log');
    if (el) el.textContent += msg + '\n';
  }

  function describe(node) {
    var cls = node.className ? ('.' + String(node.className).trim().replace(/\s+/g, '.')) : '';
    return node.tagName + cls;
  }

  function run() {
    log('=== init: hash=' + location.hash);
    log('main-view hidden=' + document.getElementById('main-view').hidden);
    log('errors(init)=' + JSON.stringify(window.__errors));

    var newBtn = document.getElementById('new-project-btn');
    log('newBtn=' + !!newBtn);
    newBtn.click();

    setTimeout(function () {
      var root = document.getElementById('modal-root');
      log('--- modal open: hidden=' + root.hidden);
      log('nodes=' + Array.prototype.map.call(root.querySelectorAll('*'), describe).join(' | '));
      log('controls=' + Array.prototype.map.call(root.querySelectorAll('input,select,textarea,button'), function (n) {
        return n.tagName + '[type=' + (n.type || '') + '][value=' + (n.value || '') + ']' + (n.textContent ? '[text=' + n.textContent + ']' : '');
      }).join(' ; '));
      log('errors(open)=' + JSON.stringify(window.__errors));

      var nameInput = root.querySelector('input[type="text"]');
      if (nameInput) nameInput.value = '鲸落';
      log('name=' + JSON.stringify(nameInput ? nameInput.value : null));

      var actionBtns = Array.prototype.slice.call(root.querySelectorAll('.modal-actions button'));
      log('actions=' + actionBtns.map(function (b) { return b.textContent + '/' + b.className; }).join(' ; '));

      var okBtn = null;
      actionBtns.forEach(function (b) {
        if (b.className.indexOf('btn-primary') >= 0) okBtn = b;
      });
      if (!okBtn) {
        log('NO OK BUTTON');
        finish();
        return;
      }
      log('click ok: text=' + okBtn.textContent + ' disabled=' + okBtn.disabled);
      okBtn.click();

      setTimeout(function () {
        log('--- after create ---');
        log('calls=' + JSON.stringify(window.__calls));
        log('errors=' + JSON.stringify(window.__errors));
        log('modal hidden=' + root.hidden);
        var errEl = root.querySelector('.form-error');
        log('form-error=' + JSON.stringify(errEl ? errEl.textContent : '(node gone)'));
        log('toasts=' + JSON.stringify(Array.prototype.map.call(document.querySelectorAll('.toast'), function (t) { return t.textContent; })));
        log('hash=' + location.hash);
        log('detail hidden=' + document.getElementById('detail-view').hidden);
        finish();
      }, 600);
    }, 300);
  }

  function finish() {
    var el = document.createElement('div');
    el.id = 'probe-done';
    el.textContent = 'DONE';
    document.body.appendChild(el);
  }

  window.addEventListener('load', function () {
    setTimeout(run, 400);
  });
})();
