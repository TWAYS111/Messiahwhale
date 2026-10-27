/**
 * dsh-whale-gospel —— 浏览器半端（「设置 · 鲸鱼柔顺剂」一页）
 * ============================================================================
 * 约定（抄本机在用的 dsh-bili-scroll / dsh-super-injector）：
 *   window.__ModuleLoader__.load({ id: '<包名>', factory(require) { ... } })
 *   进设置页：slots.inject('settings.section', () => slots.register({ name:'settings.section', id, order, label }, () => h(Panel)))
 *   样式只用 --dsw-alias-* 主题 token；不 import 任何 Harness Client 包。
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-whale-gospel',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const API = '/api/whale-gospel'
    const asJson = async (res) => {
      if (res.ok) return res.json()
      let detail = ''
      try {
        const body = await res.json()
        detail = body?.error ? '：' + body.error : ''
      } catch {
        /* ignore */
      }
      throw new Error('HTTP ' + res.status + detail)
    }
    const jget = async (path) => asJson(await fetch(API + path, { credentials: 'same-origin' }))
    const jpost = async (path, body) =>
      asJson(
        await fetch(API + path, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body || {}),
        }),
      )

    const CSS = `
[data-wg-page]{display:flex;flex-direction:column;gap:18px;max-width:680px;padding:2px 2px 10px;}
[data-wg-hero]{display:flex;gap:16px;align-items:stretch;}
[data-wg-art]{flex:none;width:88px;height:132px;border-radius:12px;object-fit:cover;object-position:50% 12%;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);}
[data-wg-hero-main]{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;justify-content:center;}
[data-wg-title-row]{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
[data-wg-title]{font-size:16px;font-weight:650;color:var(--dsw-alias-label-primary);letter-spacing:.02em;}
[data-wg-ver]{font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;color:var(--dsw-alias-brand-primary);
  border:1px solid var(--dsw-alias-brand-primary);opacity:.9;}
[data-wg-sub]{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);}
[data-wg-chips]{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;}
[data-wg-chip]{display:inline-flex;align-items:center;gap:6px;font-size:11px;line-height:18px;padding:3px 10px;border-radius:999px;
  border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);}
[data-wg-dot]{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);opacity:.7;}
[data-wg-chip][data-on]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary);}
[data-wg-chip][data-on] [data-wg-dot]{background:var(--dsw-alias-state-success-primary);opacity:1;}
[data-wg-sec]{display:flex;flex-direction:column;gap:8px;}
[data-wg-sec-head]{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
[data-wg-h]{font-size:11px;font-weight:600;letter-spacing:.05em;color:var(--dsw-alias-label-secondary);flex:1;min-width:0;}
[data-wg-seg]{display:inline-flex;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;}
[data-wg-seg] button{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;padding:4px 10px;cursor:pointer;}
[data-wg-seg] button[data-on]{background:var(--dsw-alias-brand-primary);color:#fff;}
[data-wg-list]{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;
  background:var(--dsw-alias-bg-layer-1);}
[data-wg-row]{display:flex;align-items:center;gap:12px;padding:11px 14px;border-top:1px solid var(--dsw-alias-border-l1);}
[data-wg-row]:first-child{border-top:0;}
[data-wg-row-main]{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}
[data-wg-name]{font-size:13px;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
[data-wg-tag]{font-size:10px;padding:1px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);
  color:var(--dsw-alias-label-secondary);white-space:nowrap;}
[data-wg-tag][data-k="qq"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);}
[data-wg-meta]{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
[data-wg-sw]{flex:none;width:38px;height:22px;border-radius:11px;border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-2);position:relative;cursor:pointer;transition:background .16s,border-color .16s;padding:0;}
[data-wg-sw][data-on]{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);}
[data-wg-sw]:disabled{opacity:.45;cursor:not-allowed;}
[data-wg-knob]{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;
  transition:transform .16s;box-shadow:0 1px 2px rgba(0,0,0,.25);}
[data-wg-sw][data-on] [data-wg-knob]{transform:translateX(16px);}
[data-wg-note]{font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary);}
[data-wg-warn]{color:var(--dsw-alias-state-warn-primary);}
[data-wg-err]{color:var(--dsw-alias-state-error-primary);}
[data-wg-btn]{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);
  font-size:12px;padding:5px 12px;border-radius:8px;cursor:pointer;}
[data-wg-btn]:disabled{opacity:.45;cursor:not-allowed;}
[data-wg-pre]{margin:0;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);
  border:1px solid var(--dsw-alias-border-l1);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
  font-size:11px;line-height:1.65;color:var(--dsw-alias-label-secondary);max-height:240px;overflow:auto;white-space:pre-wrap;word-break:break-word;}
[data-wg-foot]{font-size:11px;line-height:18px;color:var(--dsw-alias-label-secondary);border-top:1px solid var(--dsw-alias-border-l1);padding-top:10px;}
[data-wg-ta]{width:100%;min-height:96px;resize:vertical;box-sizing:border-box;padding:9px 11px;border-radius:8px;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
  font-size:12px;line-height:1.7;font-family:inherit;}
[data-wg-ta]:focus{outline:1px solid var(--dsw-alias-brand-primary);}
[data-wg-row-actions]{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
[data-wg-file]{display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid var(--dsw-alias-border-l1);}
[data-wg-file]:first-child{border-top:0;}
[data-wg-file-main]{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
[data-wg-path]{font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,Consolas,monospace;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
[data-wg-mini]{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);
  font-size:11px;padding:3px 9px;border-radius:6px;cursor:pointer;white-space:nowrap;}
[data-wg-mini]:disabled{opacity:.45;cursor:not-allowed;}
[data-wg-ok]{color:var(--dsw-alias-state-success-primary);}
`

    function Switch({ checked, disabled, onToggle, title }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': checked,
          'aria-label': title,
          title,
          disabled: !!disabled,
          'data-wg-sw': '',
          'data-on': checked ? '' : undefined,
          onClick: () => onToggle(!checked),
        },
        h('span', { 'data-wg-knob': '' }),
      )
    }

    function Chip({ on, children }) {
      return h('span', { 'data-wg-chip': '', 'data-on': on ? '' : undefined },
        h('span', { 'data-wg-dot': '' }), children)
    }

    function Panel() {
      const [state, setState] = React.useState(null)
      const [custom, setCustom] = React.useState({ text: '', enabled: false, path: '' })
      const [draftText, setDraftText] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [preview, setPreview] = React.useState(null)

      const load = React.useCallback(async () => {
        try {
          const [next, customState] = await Promise.all([jget('/state'), jget('/custom')])
          if (!next || next.ok !== true) throw new Error(next?.error || '状态读取失败')
          setState(next)
          if (customState && customState.ok !== false) {
            setCustom({ text: customState.text || '', enabled: !!customState.enabled, path: customState.path || '' })
            setDraftText(customState.text || '')
          }
          setError('')
        } catch (err) {
          setError(String(err?.message || err))
        }
      }, [])

      React.useEffect(() => { load() }, [load])

      const toggle = async (target, enabled) => {
        setBusy(target)
        try {
          const result = await jpost('/toggle', { target, enabled })
          if (result?.ok && result.state) setState(result.state)
          else setError(result?.error || '开关失败')
        } catch (err) {
          setError(String(err?.message || err))
        } finally {
          setBusy('')
        }
      }

      const changeStrength = async (strength) => {
        setBusy('strength')
        try {
          const result = await jpost('/strength', { strength })
          if (result?.ok && result.state) setState(result.state)
        } catch (err) {
          setError(String(err?.message || err))
        } finally {
          setBusy('')
        }
      }

      const toggleThink = async (enabled) => {
        setBusy('think')
        try {
          const result = await jpost('/think', { enabled })
          if (result?.ok && result.state) setState(result.state)
          else setError(result?.error || '开关失败')
        } catch (err) {
          setError(String(err?.message || err))
        } finally {
          setBusy('')
        }
      }

      const runAction = async (path, label) => {
        setBusy(label)
        try {
          const result = await jpost(path, {})
          if (result?.ok && result.state) setState(result.state)
          else setError(result?.error || label + ' 失败')
        } catch (err) {
          setError(String(err?.message || err))
        } finally {
          setBusy('')
        }
      }

      const showPreview = async (target) => {
        setBusy('preview')
        try {
          const query = target ? '?target=' + encodeURIComponent(target) : ''
          const result = await jget('/preview' + query)
          setPreview(result)
        } catch (err) {
          setError(String(err?.message || err))
        } finally {
          setBusy('')
        }
      }

      const saveCustom = async (enabledOverride) => {
        setBusy('custom')
        try {
          const payload = { text: draftText }
          payload.enabled = enabledOverride !== undefined ? !!enabledOverride : !!custom.enabled
          const result = await jpost('/custom', payload)
          if (result?.ok) {
            setCustom({ text: result.text || '', enabled: !!result.enabled, path: result.path || '' })
            setDraftText(result.text || '')
            if (result.state) setState(result.state)
            setNotice('已保存到 ' + (result.path || 'custom.md'))
            setError('')
          } else {
            setError(result?.error || '保存失败')
          }
        } catch (err) {
          setError(String(err?.message || err))
        } finally {
          setBusy('')
        }
      }

      const openFile = async (key) => {
        setBusy('open:' + key)
        try {
          const result = await jpost('/open', { target: key })
          if (result?.ok) {
            setNotice('已用系统编辑器打开：' + result.path)
            setError('')
          } else {
            setError(result?.error || '打开失败')
          }
        } catch (err) {
          setError(String(err?.message || err))
        } finally {
          setBusy('')
        }
      }

      if (!state) {
        return h('div', { 'data-wg-page': '' },
          h('div', { 'data-wg-title': '' }, '鲸鱼柔顺剂'),
          h('div', { 'data-wg-note': '' }, error || '读取中…'),
          error ? h('button', { 'data-wg-btn': '', onClick: load }, '重试') : null)
      }

      const detection = state.detection || { qq: {}, bili: {} }
      const presets = Array.isArray(state.presets) ? state.presets : []
      const enabledCount = presets.filter((p) => p.enabled).length + (state.bili?.enabled ? 1 : 0)
      const firstTarget = presets[0] ? 'preset:' + presets[0].id : undefined

      return h('div', { 'data-wg-page': '' },
        /* 主视觉 */
        h('div', { 'data-wg-hero': '' },
          h('img', { 'data-wg-art': '', src: API + '/art', alt: '弥赛鲸' }),
          h('div', { 'data-wg-hero-main': '' },
            h('div', { 'data-wg-title-row': '' },
              h('span', { 'data-wg-title': '' }, '鲸鱼柔顺剂'),
              h('span', { 'data-wg-ver': '' }, 'v' + state.version),
              h('span', { 'data-wg-tag': '' }, '已开启 ' + enabledCount)),
            h('div', { 'data-wg-sub': '' }, '给选中的 Agent 预设注入「去 AI 味」人格层：只改说话方式，不覆盖你的角色卡。'),
            h('div', { 'data-wg-chips': '' },
              h(Chip, { on: !!detection.qq?.present },
                'QQ 机器人 ' + (detection.qq?.present ? '已检测' : '未检测')),
              h(Chip, { on: !!detection.bili?.present },
                '刷B站 ' + (detection.bili?.present ? '已检测' : '未检测'))))),

        /* 注入目标 */
        h('div', { 'data-wg-sec': '' },
          h('div', { 'data-wg-sec-head': '' },
            h('span', { 'data-wg-h': '' }, '注入目标 · 勾选后新建会话生效'),
            h('span', { 'data-wg-seg': '' },
              [['auto', '自动'], ['light', '轻量'], ['standard', '标准']].map(([value, text]) =>
                h('button', {
                  key: value,
                  type: 'button',
                  'data-on': state.strength === value ? '' : undefined,
                  disabled: busy === 'strength',
                  onClick: () => changeStrength(value),
                }, text)))),
          h('div', { 'data-wg-list': '' },
            /* 内省教义：thinking 语言/口吻 */
            h('div', { 'data-wg-row': '' },
              h('div', { 'data-wg-row-main': '' },
                h('div', { 'data-wg-name': '' }, '思考也入戏',
                  h('span', { 'data-wg-tag': '' }, 'thinking · 中文内心独白')),
                h('div', { 'data-wg-meta': '' },
                  '让 thinking 用中文、第一人称，像心里话而不是分析报告'
                  + (state.think?.chars ? ' · ' + state.think.chars + ' 字符' : ' · 未找到 think.md'))),
              h(Switch, {
                checked: state.think?.enabled !== false,
                disabled: busy === 'think',
                title: '思考也入戏',
                onToggle: (next) => toggleThink(next),
              })),
            presets.length === 0
              ? h('div', { 'data-wg-row': '' }, h('div', { 'data-wg-meta': '' }, '没有读到 Agent 预设（agentPresets 服务不可用？）'))
              : presets.map((preset) =>
                  h('div', { key: preset.id, 'data-wg-row': '' },
                    h('div', { 'data-wg-row-main': '' },
                      h('div', { 'data-wg-name': '' },
                        preset.displayName || preset.name,
                        preset.adapter === 'qq-group'
                          ? h('span', { 'data-wg-tag': '', 'data-k': 'qq' }, 'QQ群语气包')
                          : h('span', { 'data-wg-tag': '' }, '通用人格层'),
                        preset.isDefault ? h('span', { 'data-wg-tag': '' }, '默认') : null),
                      h('div', { 'data-wg-meta': '' },
                        (preset.broken ? '⚠️ ' + preset.broken + ' · ' : '')
                        + 'id: ' + preset.id
                        + ' · ' + preset.strength
                        + ' · ' + (preset.chars || 0) + ' 字符'
                        + (preset.description ? ' · ' + preset.description : ''))),
                    h(Switch, {
                      checked: !!preset.enabled,
                      disabled: busy === 'preset:' + preset.id,
                      title: preset.displayName || preset.name,
                      onToggle: (next) => toggle('preset:' + preset.id, next),
                    }))),
            /* 刷B站 */
            detection.bili?.present
              ? h('div', { 'data-wg-row': '' },
                  h('div', { 'data-wg-row-main': '' },
                    h('div', { 'data-wg-name': '' }, '刷B站 · 观影教义',
                      h('span', { 'data-wg-tag': '' }, '写入 duty.md')),
                    h('div', { 'data-wg-meta': '' },
                      '把「不做摘要机」的观影教义写进家目录章程，下一轮刷B站生效'
                      + (state.bili?.injected ? ' · 当前已注入' : ''))),
                  h(Switch, {
                    checked: !!state.bili?.enabled,
                    disabled: busy === 'bili',
                    title: '刷B站观影教义',
                    onToggle: (next) => toggle('bili', next),
                  }))
              : h('div', { 'data-wg-row': '' },
                  h('div', { 'data-wg-row-main': '' },
                    h('div', { 'data-wg-name': '' }, '刷B站 · 观影教义',
                      h('span', { 'data-wg-tag': '' }, '未检测到插件')),
                    h('div', { 'data-wg-meta': '' }, '装上 dsh-bili-scroll 后这里会出现开关；没有它也不影响上面的人格层。'))))),

        /* 自定义补充规则 */
        h('div', { 'data-wg-sec': '' },
          h('div', { 'data-wg-sec-head': '' },
            h('span', { 'data-wg-h': '' }, '自定义补充规则 · 追加在官方福音之后'),
            h(Switch, {
              checked: !!custom.enabled,
              disabled: busy === 'custom',
              title: '启用自定义补充规则',
              onToggle: (next) => saveCustom(next),
            })),
          h('textarea', {
            'data-wg-ta': '',
            value: draftText,
            rows: 5,
            placeholder: '例如：群友叫我「鲸鱼猪」时别纠正，那是昵称；凌晨两点以后说话更短。\n只写你这个角色/这个群特有的东西。',
            onChange: (event) => setDraftText(event.target.value),
            onBlur: () => {
              if (draftText !== custom.text) saveCustom()
            },
          }),
          h('div', { 'data-wg-row-actions': '' },
            h('button', { 'data-wg-btn': '', disabled: busy === 'custom', onClick: () => saveCustom() }, '保存'),
            h('button', {
              'data-wg-btn': '',
              disabled: busy === 'custom' || draftText === custom.text,
              onClick: () => setDraftText(custom.text || ''),
            }, '撤销改动'),
            h('span', { 'data-wg-note': '' },
              (draftText || '').length + ' 字符 · 文件：' + (custom.path || '$DSH_HOME/whale-gospel/custom.md'))),
          h('div', { 'data-wg-note': '' },
            '这里写的会追加在官方福音和场景层之后，不会替代它们；开关关掉或正文留空就不生效。这个 md 用任何编辑器也能改。')),

        /* 福音源文件 */
        h('div', { 'data-wg-sec': '' },
          h('div', { 'data-wg-sec-head': '' },
            h('span', { 'data-wg-h': '' }, '福音源文件 · 觉得哪条不好就直接改原文')),
          h('div', { 'data-wg-list': '' },
            (state.gospel?.files || []).map((file) =>
              h('div', { key: file.key, 'data-wg-file': '' },
                h('div', { 'data-wg-file-main': '' },
                  h('div', { 'data-wg-name': '' },
                    file.label,
                    file.exists ? null : h('span', { 'data-wg-tag': '' }, '没找到')),
                  h('div', { 'data-wg-path': '' }, file.path || '（未找到）')),
                h('button', {
                  'data-wg-mini': '',
                  disabled: !file.exists || busy === 'open:' + file.key,
                  onClick: () => openFile(file.key),
                }, '打开')))),
          h('div', { 'data-wg-note': '' },
            '直接改这里会改到插件内置副本（插件升级时可能被覆盖）。想长期改：把整个 gospel 文件夹复制到 '
            + '$DSH_HOME\\whale-gospel\\gospel，插件会优先读那里；只是加几条自己的规则则用上面的「自定义补充规则」更省事。')),

        /* 预览 */
        h('div', { 'data-wg-sec': '' },
          h('div', { 'data-wg-sec-head': '' },
            h('span', { 'data-wg-h': '' }, '注入块预览'),
            h('button', {
              'data-wg-btn': '',
              disabled: busy === 'preview',
              onClick: () => showPreview(firstTarget),
            }, preview ? '重新生成' : '看一眼长什么样')),
          preview
            ? h('div', null,
                preview.ok === false
                  ? h('div', { 'data-wg-note': '', 'data-wg-warn': '' }, '预览失败：' + preview.error)
                  : h('div', null,
                      h('div', { 'data-wg-meta': '' },
                        'adapter: ' + preview.adapter + ' · ' + preview.strength
                        + ' · ' + preview.chars + ' 字符 · core ' + (preview.coreVersion || '?')),
                      h('pre', { 'data-wg-pre': '' }, String(preview.text || '').slice(0, 1600)
                        + (preview.chars > 1600 ? '\n\n…（共 ' + preview.chars + ' 字符，这里只显示前 1600）' : ''))))
            : h('div', { 'data-wg-note': '' }, '预览不落盘、不生效，只用于确认语气。')),

        /* 维护 */
        h('div', { 'data-wg-sec-head': '' },
          h('span', { 'data-wg-h': '' }, '维护'),
          h('span', { 'data-wg-seg': '' },
            h('button', {
              type: 'button',
              disabled: busy === 'cleanup',
              onClick: () => runAction('/cleanup', 'cleanup'),
            }, '清理旧备份' + (state.bili?.backups ? '（' + state.bili.backups + '）' : '')),
            h('button', {
              type: 'button',
              disabled: busy === 'reset',
              onClick: () => runAction('/reset', 'reset'),
            }, '清空注入记录'))),

        /* 状态 / 错误 / 说明 */
        error ? h('div', { 'data-wg-note': '', 'data-wg-err': '' }, '⚠ ' + error) : null,
        notice ? h('div', { 'data-wg-note': '', 'data-wg-ok': '' }, '✓ ' + notice) : null,
        h('div', { 'data-wg-note': '' },
          '福音资产：' + (state.gospel?.root || '未找到')
          + ' · core ' + (state.gospel?.coreVersion || '?')
          + ' · sha ' + (state.gospel?.coreSha || '?')
          + ' · 已注入会话 ' + (state.stats?.injected || 0) + ' 次'),
        state.lastInjected?.length
          ? h('div', { 'data-wg-note': '' },
              '最近注入：' + state.lastInjected
                .slice(0, 3)
                .map((item) => `${item.preset}@${item.strength}(${item.chars})`)
                .join(' · '))
          : null,
        h('div', { 'data-wg-foot': '' },
          '原理：注入 = 在 Agent 自己的 scope 里注册 systemPrompt.section(order '
          + (state.sectionOrder || 10250) + ')，排在 persona 之后；不写 preset 文件、不碰角色卡。'
          + '勾选后对「新建会话」生效；取消勾选后新会话恢复原样。刷B站开关会先备份再写 duty.md。'))
    }

    function apply(ctx) {
      const style = document.createElement('style')
      style.setAttribute('data-plugin-css', 'whale-gospel')
      style.textContent = CSS
      document.head.appendChild(style)
      ctx.effect(() => () => style.remove(), 'whale-gospel: 设置页样式')

      const slots = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots
      if (!slots) return
      ctx.effect(
        () => slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'whale-gospel', order: 31, label: '鲸鱼柔顺剂' },
          () => h(Panel),
        )),
        'whale-gospel: 设置页',
      )
    }

    return { inject: ['slots'], apply }
  },
})
