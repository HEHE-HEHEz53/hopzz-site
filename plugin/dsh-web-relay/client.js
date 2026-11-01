/**
 * 手机网页对话 —— 设置面板（客户端）
 * ==================================
 *
 * 在 DSH「设置」里新增一个页面，提供：
 *   1. 连接状态
 *   2. 两种连接方式：参数 / 连接字符串
 *   3. 一键部署 WebUI
 *   4. 常规设置（重连间隔）
 *
 * 与宿主通信走同源 HTTP 路由（/web-relay/api/*），由 index.js 注册。
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-web-relay',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback, useRef } = React;

    const API = '/web-relay/api';

    const styles = {
      page: {
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        padding: '4px 2px 28px',
        color: 'inherit',
        fontSize: '14px',
        maxWidth: '720px',
      },
      card: {
        border: '1px solid var(--dsw-alias-border-subtle, rgba(128,128,128,0.28))',
        borderRadius: '14px',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        background: 'var(--dsw-alias-surface-raised, rgba(128,128,128,0.06))',
      },
      title: { fontSize: '14px', fontWeight: 600, margin: 0 },
      hint: { fontSize: '12px', opacity: 0.66, margin: 0, lineHeight: 1.6 },
      row: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
      label: { fontSize: '12px', opacity: 0.8, minWidth: '86px' },
      input: {
        flex: '1 1 260px',
        minWidth: '200px',
        padding: '8px 10px',
        borderRadius: '9px',
        border: '1px solid var(--dsw-alias-border-subtle, rgba(128,128,128,0.3))',
        background: 'var(--dsw-alias-surface-sunken, rgba(128,128,128,0.08))',
        color: 'inherit',
        font: 'inherit',
        fontSize: '13px',
        outline: 'none',
      },
      textarea: {
        width: '100%',
        minHeight: '76px',
        padding: '9px 11px',
        borderRadius: '10px',
        border: '1px solid var(--dsw-alias-border-subtle, rgba(128,128,128,0.3))',
        background: 'var(--dsw-alias-surface-sunken, rgba(128,128,128,0.08))',
        color: 'inherit',
        font: 'inherit',
        fontSize: '12.5px',
        resize: 'vertical',
        outline: 'none',
        wordBreak: 'break-all',
      },
      button: {
        padding: '8px 16px',
        borderRadius: '9px',
        border: '1px solid var(--dsw-alias-border-subtle, rgba(128,128,128,0.32))',
        background: 'var(--dsw-alias-surface-raised, rgba(128,128,128,0.1))',
        color: 'inherit',
        font: 'inherit',
        fontSize: '13px',
        cursor: 'pointer',
      },
      primary: {
        padding: '8px 16px',
        borderRadius: '9px',
        border: '1px solid transparent',
        background: 'var(--dsw-alias-accent-fill, #2f7fb8)',
        color: 'var(--dsw-alias-accent-foreground, #fff)',
        font: 'inherit',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
      },
      disabled: { opacity: 0.55, cursor: 'not-allowed' },
      tabs: { display: 'flex', gap: '6px' },
      tab: {
        padding: '6px 14px',
        borderRadius: '999px',
        border: '1px solid var(--dsw-alias-border-subtle, rgba(128,128,128,0.3))',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        fontSize: '12.5px',
        cursor: 'pointer',
      },
      tabActive: {
        padding: '6px 14px',
        borderRadius: '999px',
        border: '1px solid transparent',
        background: 'var(--dsw-alias-accent-fill, #2f7fb8)',
        color: 'var(--dsw-alias-accent-foreground, #fff)',
        font: 'inherit',
        fontSize: '12.5px',
        fontWeight: 600,
        cursor: 'pointer',
      },
      dot: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' },
      log: {
        maxHeight: '190px',
        overflow: 'auto',
        padding: '10px 12px',
        borderRadius: '10px',
        background: 'var(--dsw-alias-surface-sunken, rgba(0,0,0,0.22))',
        font: '12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        margin: 0,
      },
      msg: { fontSize: '12.5px', margin: 0 },
    };

    async function call(path, options) {
      const res = await fetch(API + path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        data = {};
      }
      if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
      return data;
    }

    function StatusCard(props) {
      const st = props.status || {};
      const online = !!st.connected;
      return h(
        'div',
        { style: styles.card },
        h(
          'div',
          { style: styles.row },
          h('span', {
            style: {
              ...styles.dot,
              background: online ? '#3ecf8e' : '#c9556b',
              boxShadow: '0 0 0 3px ' + (online ? 'rgba(62,207,142,.22)' : 'rgba(201,85,107,.22)'),
            },
          }),
          h('strong', { style: { fontSize: '13px' } }, online ? '已连接到服务器' : '未连接'),
          h('span', { style: { ...styles.hint, marginLeft: 'auto' } }, '插件 v' + (st.version || '?'))
        ),
        st.effectiveUrl
          ? h('p', { style: styles.hint }, '当前地址：' + st.effectiveUrl + '（来源：' + (st.source === 'string' ? '连接字符串' : st.source === 'fields' ? '参数' : '默认值') + '）')
          : null
      );
    }

    function ConnectCard(props) {
      const st = props.status || {};
      const [mode, setMode] = useState(st.mode || 'string');
      const [connectString, setConnectString] = useState('');
      const [serverUrl, setServerUrl] = useState('');
      const [agentToken, setAgentToken] = useState('');
      const [saving, setSaving] = useState(false);
      const [msg, setMsg] = useState(null);
      const [showToken, setShowToken] = useState(false);

      useEffect(() => {
        setConnectString(st.connectString || '');
        setServerUrl(st.serverUrl || '');
        setAgentToken(st.agentToken || '');
        if (st.mode) setMode(st.mode);
      }, [st.connectString, st.serverUrl, st.agentToken, st.mode]);

      const save = useCallback(
        async (nextMode) => {
          setSaving(true);
          setMsg(null);
          try {
            const body =
              nextMode === 'string'
                ? { mode: 'string', connectString: connectString.trim() }
                : { mode: 'fields', serverUrl: serverUrl.trim(), agentToken: agentToken.trim() };
            const data = await call('/settings', { method: 'POST', body: JSON.stringify(body) });
            setMsg({ ok: true, text: data.message || '已保存，正在重连…' });
            props.onChanged && props.onChanged();
          } catch (err) {
            setMsg({ ok: false, text: String(err.message || err) });
          } finally {
            setSaving(false);
          }
        },
        [connectString, serverUrl, agentToken, props]
      );

      const test = useCallback(async () => {
        setSaving(true);
        setMsg(null);
        try {
          const data = await call('/test', { method: 'POST' });
          setMsg({ ok: !!data.ok, text: data.message || (data.ok ? '连接正常' : '连不上') });
        } catch (err) {
          setMsg({ ok: false, text: String(err.message || err) });
        } finally {
          setSaving(false);
        }
      }, []);

      return h(
        'div',
        { style: styles.card },
        h('h3', { style: styles.title }, '连接方式'),
        h(
          'div',
          { style: styles.tabs },
          h(
            'button',
            {
              type: 'button',
              style: mode === 'string' ? styles.tabActive : styles.tab,
              onClick: () => setMode('string'),
            },
            '用连接字符串'
          ),
          h(
            'button',
            {
              type: 'button',
              style: mode === 'fields' ? styles.tabActive : styles.tab,
              onClick: () => setMode('fields'),
            },
            '用参数'
          )
        ),
        mode === 'string'
          ? h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
              h(
                'p',
                { style: styles.hint },
                '在「鲸鱼娘在线」网页里：⚙ 设置 → 连接参数 → 复制「连接字符串」，粘贴到这里。以 whale1. 开头的一整串。'
              ),
              h('textarea', {
                style: styles.textarea,
                value: connectString,
                placeholder: '',
                spellCheck: false,
                onChange: (e) => setConnectString(e.target.value),
              })
            )
          : h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
              h(
                'div',
                { style: styles.row },
                h('span', { style: styles.label }, '服务器地址'),
                h('input', {
                  style: styles.input,
                  value: serverUrl,
                  placeholder: '',
                  spellCheck: false,
                  onChange: (e) => setServerUrl(e.target.value),
                })
              ),
              h(
                'div',
                { style: styles.row },
                h('span', { style: styles.label }, '插件令牌'),
                h('input', {
                  style: styles.input,
                  type: showToken ? 'text' : 'password',
                  value: agentToken,
                  placeholder: '',
                  spellCheck: false,
                  onChange: (e) => setAgentToken(e.target.value),
                }),
                h(
                  'button',
                  { type: 'button', style: styles.button, onClick: () => setShowToken(!showToken) },
                  showToken ? '隐藏' : '显示'
                )
              )
            ),
        h(
          'div',
          { style: styles.row },
          h(
            'button',
            {
              type: 'button',
              style: saving ? { ...styles.primary, ...styles.disabled } : styles.primary,
              disabled: saving,
              onClick: () => save(mode),
            },
            saving ? '保存中…' : '保存并重连'
          ),
          h(
            'button',
            {
              type: 'button',
              style: saving ? { ...styles.button, ...styles.disabled } : styles.button,
              disabled: saving,
              onClick: test,
            },
            '测试连接'
          ),
          msg
            ? h(
                'span',
                { style: { ...styles.msg, color: msg.ok ? '#3ecf8e' : '#e0736f' } },
                msg.text
              )
            : null
        )
      );
    }

    function DeployCard() {
      const [running, setRunning] = useState(false);
      const [log, setLog] = useState('');
      const [done, setDone] = useState(null);
      const alive = useRef(true);

      useEffect(() => {
        alive.current = true;
        return () => {
          alive.current = false;
        };
      }, []);

      const deploy = useCallback(async () => {
        setRunning(true);
        setLog('正在执行部署，可能需要 1~3 分钟…\n');
        setDone(null);
        try {
          const data = await call('/deploy', { method: 'POST' });
          if (!alive.current) return;
          setLog(data.log || '(没有输出)');
          setDone({ ok: !!data.ok, text: data.message || (data.ok ? '部署完成' : '部署失败') });
        } catch (err) {
          if (!alive.current) return;
          setLog(String(err.message || err));
          setDone({ ok: false, text: '部署失败' });
        } finally {
          if (alive.current) setRunning(false);
        }
      }, []);

      return h(
        'div',
        { style: styles.card },
        h('h3', { style: styles.title }, '部署 WebUI'),
        h(
          'p',
          { style: styles.hint },
          '在你的服务器上安装/更新「鲸鱼娘在线」。会用下面的 SSH 配置把仓库里的 chat/ 传上去并执行安装脚本。'
        ),
        h(
          'div',
          { style: styles.row },
          h(
            'button',
            {
              type: 'button',
              style: running ? { ...styles.primary, ...styles.disabled } : styles.primary,
              disabled: running,
              onClick: deploy,
            },
            running ? '部署中…' : '一键部署'
          ),
          done
            ? h(
                'span',
                { style: { ...styles.msg, color: done.ok ? '#3ecf8e' : '#e0736f' } },
                done.text
              )
            : null
        ),
        log ? h('pre', { style: styles.log }, log) : null
      );
    }

    function GeneralCard(props) {
      const st = props.status || {};
      const [reconnect, setReconnect] = useState(String(st.maxReconnectMs || 30000));
      const [sshConfig, setSshConfig] = useState('');
      const [sshTarget, setSshTarget] = useState('');
      const [host, setHost] = useState('');
      const [port, setPort] = useState('22');
      const [user, setUser] = useState('root');
      const [password, setPassword] = useState('');
      const [domain, setDomain] = useState('');
      const [saving, setSaving] = useState(false);
      const [msg, setMsg] = useState(null);

      useEffect(() => {
        setReconnect(String(st.maxReconnectMs || 30000));
        setSshConfig(st.sshConfigPath || '');
        setSshTarget(st.sshTarget || '');
        setHost(st.deployHost || '');
        setPort(String(st.deployPort || 22));
        setUser(st.deployUser || 'root');
        setDomain(st.deployDomain || '');
      }, [st.maxReconnectMs, st.sshConfigPath, st.sshTarget, st.deployHost, st.deployPort, st.deployUser, st.deployDomain]);

      const save = useCallback(async () => {
        setSaving(true);
        setMsg(null);
        try {
          const body = {
            maxReconnectMs: Number(reconnect) || 30000,
            sshConfigPath: sshConfig.trim(),
            sshTarget: sshTarget.trim(),
            deployHost: host.trim(),
            deployPort: Number(port) || 22,
            deployUser: user.trim() || 'root',
            deployDomain: domain.trim(),
          };
          if (password) body.deployPassword = password;
          await call('/general', { method: 'POST', body: JSON.stringify(body) });
          setPassword('');
          setMsg({ ok: true, text: '已保存' });
          props.onChanged && props.onChanged();
        } catch (err) {
          setMsg({ ok: false, text: String(err.message || err) });
        } finally {
          setSaving(false);
        }
      }, [reconnect, sshConfig, sshTarget, host, port, user, password, domain, props]);

      const field = (label, value, onChange, placeholder, type) =>
        h(
          'div',
          { style: styles.row },
          h('span', { style: styles.label }, label),
          h('input', {
            style: styles.input,
            type: type || 'text',
            value: value,
            placeholder: placeholder,
            spellCheck: false,
            onChange: (e) => onChange(e.target.value),
          })
        );

      return h(
        'div',
        { style: styles.card },
        h('h3', { style: styles.title }, '常规设置'),

        h('p', { style: styles.hint }, '部署用的服务器信息（填了 IP + root 密码，一键部署就不用依赖本机 SSH 配置）'),
        field('服务器地址', host, setHost, ''),
        field('端口', port, setPort, ''),
        field('用户名', user, setUser, ''),
        field('密码', password, setPassword, '', 'password'),
        field('域名', domain, setDomain, ''),

        h('p', { style: { ...styles.hint, marginTop: '6px' } }, '高级：本机已配好 SSH 密钥的话，也可以走配置文件'),
        field('SSH 配置', sshConfig, setSshConfig, ''),
        field('SSH 主机', sshTarget, setSshTarget, ''),

        h(
          'div',
          { style: styles.row },
          h(
            'button',
            {
              type: 'button',
              style: saving ? { ...styles.primary, ...styles.disabled } : styles.primary,
              disabled: saving,
              onClick: save,
            },
            saving ? '保存中…' : '保存'
          ),
          h('span', { style: styles.hint }, '断线重连 '),
          h('input', {
            style: { ...styles.input, flex: '0 0 100px', minWidth: '90px' },
            value: reconnect,
            inputMode: 'numeric',
            onChange: (e) => setReconnect(e.target.value),
          }),
          h('span', { style: styles.hint }, '毫秒'),
          msg
            ? h(
                'span',
                { style: { ...styles.msg, color: msg.ok ? '#3ecf8e' : '#e0736f' } },
                msg.text
              )
            : null
        )
      );
    }
    function SettingsSection() {
      const [status, setStatus] = useState(null);
      const [error, setError] = useState(null);

      const load = useCallback(async () => {
        try {
          const data = await call('/status');
          setStatus(data);
          setError(null);
        } catch (err) {
          setError(String(err.message || err));
        }
      }, []);

      useEffect(() => {
        let stop = false;
        load();
        const timer = setInterval(() => {
          if (!stop) load();
        }, 5000);
        return () => {
          stop = true;
          clearInterval(timer);
        };
      }, [load]);

      if (error) {
        return h(
          'div',
          { style: styles.page },
          h(
            'p',
            { style: { ...styles.msg, color: '#e0736f' } },
            '读取插件设置失败：' + error
          ),
          h(
            'button',
            { type: 'button', style: styles.button, onClick: load },
            '重试'
          )
        );
      }

      if (!status) {
        return h('p', { style: styles.hint }, '正在读取…');
      }

      return h(
        'div',
        { style: styles.page },
        h(StatusCard, { status }),
        h(ConnectCard, { status, onChanged: load }),
        h(DeployCard, {}),
        h(GeneralCard, { status, onChanged: load })
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'web-relay',
              order: 8,
              label: '鲸鱼娘在线',
            },
            SettingsSection
          )
        );
      },
    };
  },
});
