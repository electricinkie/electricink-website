# 🔔 SENTRY ERROR MONITORING SETUP

## ✅ O QUE FOI IMPLEMENTADO

### 1. Frontend Error Monitoring
**Arquivo:** `/js/sentry-init.js`

**Features:**
- ✅ Captura erros JavaScript automáticos
- ✅ Performance monitoring (page load, API calls)
- ✅ Session Replay (vídeo da sessão do user quando erro acontece)
- ✅ User context (browser, OS, device)
- ✅ Cart info nos errors (quantos items)
- ✅ Ignora erros comuns de browser

### 2. Backend Error Monitoring
**Arquivo:** `/api/lib/sentry.js`

**Features:**
- ✅ Captura erros em API routes
- ✅ Request context (URL, method, headers)
- ✅ Stack traces completos
- ✅ Integração com Vercel

### 3. Integration nos API Endpoints
**Modificado:** `/api/create-payment-intent.js`

**Features:**
- ✅ Captura erros de pagamento
- ✅ Tags: validation vs stripe_error
- ✅ Cart context nos errors

---

## 📋 SETUP NECESSÁRIO (10 MIN)

### Step 1: Criar conta Sentry (GRÁTIS)

1. **Ir para:** https://sentry.io/signup/
2. **Sign up:** GitHub account (recomendado) ou email
3. **Create project:**
   - Platform: **Browser JavaScript**
   - Project name: **electricink-ie**
   - Alert frequency: **On every new issue**

### Step 2: Copiar DSN

Após criar projeto, você verá a tela de setup:

```
Your DSN:
https://abc123def456ghi789jkl012@o123456.ingest.sentry.io/7890123
```

**Copie este DSN!**

### Step 3: Adicionar DSN ao Vercel

1. **Ir para:** https://vercel.com/YOUR_PROJECT/settings/environment-variables

2. **Adicionar variável:**
   ```
   Name: SENTRY_DSN
   Value: https://abc123def456ghi789jkl012@o123456.ingest.sentry.io/7890123
   Environment: Production, Preview, Development
   ```

3. **Save**

### Step 4: Atualizar Frontend

Abre `/js/sentry-init.js` e substitui linha 9:

```javascript
// ❌ ANTES:
const SENTRY_DSN = 'https://YOUR_SENTRY_DSN@sentry.io/YOUR_PROJECT_ID';

// ✅ DEPOIS (usa seu DSN real):
const SENTRY_DSN = 'https://abc123def456ghi789jkl012@o123456.ingest.sentry.io/7890123';
```

### Step 5: Adicionar script no HTML

Abre cada HTML page (index.html, checkout.html, etc.) e adiciona ANTES do `</head>`:

```html
<!-- Sentry Error Monitoring -->
<script src="/js/sentry-init.js"></script>
```

### Step 6: Deploy

```bash
git add -A
git commit -m "feat: add Sentry error monitoring"
git push
```

Vercel auto-deploys em ~2 min.

---

## 🧪 TESTAR

### Teste Frontend:

1. Abre console do browser (F12)
2. Digite:
   ```javascript
   throw new Error('Testing Sentry!');
   ```
3. Vai aparecer no Sentry Dashboard em ~30 segundos
4. Dashboard: https://sentry.io/organizations/YOUR_ORG/issues/

### Teste Backend:

1. Força um erro no checkout (ex: cartão inválido)
2. Error aparece no Sentry com:
   - Request URL
   - Stack trace
   - Cart info

---

## 📊 O QUE VOCÊ VAI VER NO SENTRY

### Dashboard mostra:
- 📈 **Error trends:** Quantos erros por dia
- 🔥 **Top errors:** Erros mais frequentes
- 👤 **Users affected:** Quantos users tiveram erro
- 🎥 **Session replay:** Vídeo da sessão do user (só em caso de erro)
- 📍 **Stack trace:** Linha exata do código que quebrou
- 🌍 **Browser/OS:** Chrome 120 / MacOS 14.2
- 🛒 **Cart info:** Quantos items tinha no cart

### Alertas:
- 📧 **Email:** Quando novo tipo de erro acontece
- 🔔 **Slack:** (opcional) Integração com Slack
- 📱 **SMS:** (pago) Para erros críticos

---

## 💰 CUSTO

**FREE TIER (você vai usar):**
- ✅ 5,000 errors/month
- ✅ 50 replays/month
- ✅ 1 member (você)
- ✅ 30 days data retention

**Você só paga se passar 5,000 errors/mês** (improvável).

---

## 🎯 BENEFÍCIOS

### Antes (sem Sentry):
```
❌ User: "Site não funciona"
❌ Você: "Funciona no meu PC 🤷"
❌ Debug: Impossível (nenhum log)
```

### Depois (com Sentry):
```
✅ Sentry: "15 users tiveram erro em checkout.js line 450"
✅ Você: Vê stack trace + replay da sessão
✅ Fix: Deploy fix em 10 min
✅ User: "Obrigado, já funciona! 🎉"
```

---

## 📝 CONFIGURAÇÕES OPCIONAIS

### Email notifications:

1. Sentry Dashboard → Settings → Alerts
2. Create Alert Rule:
   - **When:** New issue is created
   - **Then:** Send email to: seu@email.com

### Slack integration:

1. Sentry → Settings → Integrations → Slack
2. Connect Slack workspace
3. Choose channel: #errors
4. Recebe notificação instant no Slack

### Performance monitoring:

Já está ativo! Dashboard mostra:
- Page load time
- API response time
- Slow transactions (> 2s)

---

## 🚨 TROUBLESHOOTING

### "Sentry DSN not configured"

Console mostra: `⚠️ Sentry DSN not configured - error monitoring disabled`

**Fix:**
1. Check se SENTRY_DSN está em Vercel env vars
2. Check se atualizou `/js/sentry-init.js` com DSN real
3. Redeploy: `git push`

### "Errors not appearing in dashboard"

**Check:**
1. DSN está correto (sem typo)
2. Deploy foi completo (check Vercel logs)
3. Espera 1-2 min (Sentry tem delay)
4. Testa forçar erro: `throw new Error('test');`

### "Too many errors"

Se passar 5,000 errors/mês:
1. Vai receber email de warning
2. Sentry para de capturar (não cobra extra)
3. **Fix:** Adiciona `ignoreErrors` em sentry-init.js

---

## ✅ CHECKLIST FINAL

- [ ] Criar conta Sentry (free)
- [ ] Copiar DSN do projeto
- [ ] Adicionar SENTRY_DSN no Vercel
- [ ] Atualizar `/js/sentry-init.js` com DSN real
- [ ] Adicionar `<script src="/js/sentry-init.js"></script>` nos HTMLs
- [ ] Commit + push
- [ ] Testar erro no browser console
- [ ] Verificar erro no Sentry Dashboard

**Tempo total:** 10 min

**Benefício:** Nunca mais ficar no escuro sobre erros! 🎉

---

## 📞 SUPPORT

**Sentry Docs:** https://docs.sentry.io/  
**Sentry Status:** https://status.sentry.io/  
**Community:** https://discord.gg/sentry

**Electric Ink Support:**
- Para problemas Sentry: check SENTRY_SETUP.md
- Para erros no site: check Sentry Dashboard! 😄
