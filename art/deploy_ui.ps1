$ErrorActionPreference = 'Stop'
$f = 'D:\DSH\work\plugin\dsh-web-relay\client.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$orig = $c

$newGeneral = @'
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
        field('服务器 IP', host, setHost, '64.83.20.24'),
        field('端口', port, setPort, '22'),
        field('用户名', user, setUser, 'root'),
        field('密码', password, setPassword, st.hasDeployPassword ? '已保存，留空则不修改' : 'root 密码', 'password'),
        field('域名', domain, setDomain, 'ai.hopzz.top（要解析到这台服务器）'),

        h('p', { style: { ...styles.hint, marginTop: '6px' } }, '高级：本机已配好 SSH 密钥的话，也可以走配置文件'),
        field('SSH 配置', sshConfig, setSshConfig, 'D:\\DSH\\work\\.ssh\\config'),
        field('SSH 主机', sshTarget, setSshTarget, 'vps'),

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
'@

$pattern = '(?s)    function GeneralCard\(props\) \{.*?\n    \}\n'
if ($c -match $pattern) {
  $c = [regex]::Replace($c, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{
    param($m) return $newGeneral
  }, 1)
  "  [OK]   重写 GeneralCard（增加部署参数）"
} else {
  "  [FAIL] 没匹配到 GeneralCard"
}

if ($c -ne $orig) {
  [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))
  "已写入"
}

"`n=== 语法检查 ==="
& 'D:\IT\nodejs\node.exe' --check $f 2>&1 | Out-String
"EXIT=$LASTEXITCODE"
